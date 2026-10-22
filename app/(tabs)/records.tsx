import { useState, useEffect, useRef } from 'react';
import { Redirect } from 'expo-router';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { TrainFront, FileSpreadsheet, FileText, Trash2, Plus, X, ListFilter as Filter, LogOut } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { formatDateTime } from '@/lib/time';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { AttendanceRecord, AttendanceWithDetails, Employee, WorkLocation, AttendanceType } from '@/types/database';
import { isPrivileged } from '@/types/database';

export default function RecordsScreen() {
  const { user } = useAuth();
  const privileged = isPrivileged(user?.role || 'employee');
  const [records, setRecords] = useState<AttendanceWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const employeesRef = useRef<Employee[]>([]);
  const locationsRef = useRef<WorkLocation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AttendanceWithDetails | null>(null);
  const [error, setError] = useState('');
  const [selectedSelfie, setSelectedSelfie] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [empRes, locRes] = await Promise.all([
      supabase.from('employees').select('*').order('full_name'),
      supabase.from('work_locations').select('*').order('name'),
    ]);
    const emps = (empRes.data || []) as Employee[];
    const locs = (locRes.data || []) as WorkLocation[];
    employeesRef.current = emps;
    locationsRef.current = locs;
    setEmployees(emps);
    setLocations(locs);

    await loadRecords();
    setLoading(false);
  }

  async function loadRecords() {
    let query = supabase
      .from('attendance_records')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(500);

    if (!privileged && user) {
      query = query.eq('employee_id', user.id);
    }

    const { data, error } = await query;
    if (error || !data) {
      setLoading(false);
      return;
    }

    const empMap = new Map<string, Employee>();
    const locMap = new Map<string, WorkLocation>();
    employeesRef.current.forEach((e) => empMap.set(e.id, e));
    locationsRef.current.forEach((l) => locMap.set(l.id, l));

    const enriched: AttendanceWithDetails[] = (data as AttendanceRecord[]).map((r) => ({
      ...r,
      employee_name: empMap.get(r.employee_id)?.full_name || 'Unknown',
      location_name: locMap.get(r.work_location_id)?.name || 'Unknown',
    }));

    setRecords(enriched);
  }

  const filteredRecords = records.filter((r) => {
    if (filterEmployee !== 'all' && r.employee_id !== filterEmployee) return false;
    if (filterLocation !== 'all' && r.work_location_id !== filterLocation) return false;
    if (filterType !== 'all' && r.type !== filterType) return false;
    return true;
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('id', deleteTarget.id);
    if (error) {
      setError('Failed to delete record. Please try again.');
    } else {
      setDeleteTarget(null);
      loadRecords();
    }
  }

  function handleExportExcel() {
    if (filteredRecords.length === 0) {
      setError('No records to export');
      return;
    }
    const dateStr = new Date().toISOString().split('T')[0];
    exportToExcel(filteredRecords, `attendance_${dateStr}`);
  }

  function handleExportPDF() {
    if (filteredRecords.length === 0) {
      setError('No records to export');
      return;
    }
    const dateStr = new Date().toISOString().split('T')[0];
    exportToPDF(filteredRecords, `attendance_${dateStr}`, 'Attendance Report');
  }

  const hasFilters = filterEmployee !== 'all' || filterLocation !== 'all' || filterType !== 'all';

  if (user?.role === 'employee') {
    return <Redirect href="/(tabs)" />;
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary[600]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.exportRow}>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportExcel} activeOpacity={0.8}>
          <FileSpreadsheet size={18} color={theme.accent[600]} strokeWidth={2} />
          <Text style={styles.exportBtnText}>Excel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportPDF} activeOpacity={0.8}>
          <FileText size={18} color={theme.error[600]} strokeWidth={2} />
          <Text style={styles.exportBtnText}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.exportBtn, hasFilters && { backgroundColor: theme.primary[50] }]}
          onPress={() => setShowFilters(!showFilters)}
          activeOpacity={0.8}
        >
          <Filter size={18} color={hasFilters ? theme.primary[600] : theme.neutral[500]} strokeWidth={2} />
          <Text style={[styles.exportBtnText, hasFilters && { color: theme.primary[600] }]}>Filter</Text>
        </TouchableOpacity>
        {privileged && (
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={() => setAddModalVisible(true)}
            activeOpacity={0.8}
          >
            <Plus size={18} color={theme.neutral[600]} strokeWidth={2} />
            <Text style={styles.exportBtnText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {showFilters && (
        <View style={styles.filtersPanel}>
          {privileged && (
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Employee</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <FilterChip
                  label="All"
                  active={filterEmployee === 'all'}
                  onPress={() => setFilterEmployee('all')}
                />
                {employees.map((e) => (
                  <FilterChip
                    key={e.id}
                    label={e.full_name}
                    active={filterEmployee === e.id}
                    onPress={() => setFilterEmployee(e.id)}
                  />
                ))}
              </ScrollView>
            </View>
          )}
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Location</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <FilterChip
                label="All"
                active={filterLocation === 'all'}
                onPress={() => setFilterLocation('all')}
              />
              {locations.map((l) => (
                <FilterChip
                  key={l.id}
                  label={l.name}
                  active={filterLocation === l.id}
                  onPress={() => setFilterLocation(l.id)}
                />
              ))}
            </ScrollView>
          </View>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Type</Text>
            <View style={styles.filterRow}>
              <FilterChip
                label="All"
                active={filterType === 'all'}
                onPress={() => setFilterType('all')}
              />
              <FilterChip
                label="Check In"
                active={filterType === 'check_in'}
                onPress={() => setFilterType('check_in')}
              />
              <FilterChip
                label="Check Out"
                active={filterType === 'check_out'}
                onPress={() => setFilterType('check_out')}
              />
            </View>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {filteredRecords.length} {filteredRecords.length === 1 ? 'record' : 'records'}
          </Text>
          {hasFilters && (
            <TouchableOpacity onPress={() => {
              setFilterEmployee('all');
              setFilterLocation('all');
              setFilterType('all');
            }}>
              <Text style={styles.clearFiltersText}>Clear Filters</Text>
            </TouchableOpacity>
          )}
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
            <TouchableOpacity onPress={() => setError('')}>
              <X size={16} color={theme.error[600]} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        ) : null}

        {filteredRecords.length === 0 ? (
          <View style={styles.emptyState}>
            <TrainFront size={48} color={theme.neutral[300]} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No Records Found</Text>
            <Text style={styles.emptySubtitle}>
              {hasFilters ? 'Try adjusting your filters' : 'Attendance records will appear here'}
            </Text>
          </View>
        ) : (
          <View style={styles.recordsList}>
            {filteredRecords.map((r) => (
              <View key={r.id} style={styles.recordCard}>
                <View
                  style={[
                    styles.recordTypeIcon,
                    r.type === 'check_in'
                      ? { backgroundColor: theme.accent[50] }
                      : { backgroundColor: theme.warning[50] },
                  ]}
                >
                  {r.type === 'check_in' ? (
                    <TrainFront size={18} color={theme.accent[600]} strokeWidth={2} />
                  ) : (
                    <LogOut size={18} color={theme.warning[600]} strokeWidth={2} />
                  )}
                </View>
                <View style={styles.recordDetails}>
                  <Text style={styles.recordEmployee}>{r.employee_name}</Text>
                  <Text style={styles.recordMeta}>{r.location_name}</Text>
                  <Text style={styles.recordDate}>{formatDateTime(r.timestamp)}</Text>
                </View>
                <View style={styles.recordRight}>
                  {r.selfie_data ? (
                    <TouchableOpacity onPress={() => setSelectedSelfie(r.selfie_data)} activeOpacity={0.8}>
                      <Image source={{ uri: normalizeSelfieData(r.selfie_data) }} style={styles.selfieThumbnail} />
                    </TouchableOpacity>
                  ) : null}
                  <View
                    style={[
                      styles.typeBadge,
                      r.type === 'check_in'
                        ? { backgroundColor: theme.accent[50] }
                        : { backgroundColor: theme.warning[50] },
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeBadgeText,
                        { color: r.type === 'check_in' ? theme.accent[700] : theme.warning[700] },
                      ]}
                    >
                      {r.type === 'check_in' ? 'IN' : 'OUT'}
                    </Text>
                  </View>
                  {privileged && (
                    <TouchableOpacity
                      onPress={() => setDeleteTarget(r)}
                      style={styles.deleteBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Trash2 size={16} color={theme.error[400]} strokeWidth={2} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: theme.spacing.xxl }} />
      </ScrollView>

      <AddRecordModal
        visible={addModalVisible}
        employees={employees}
        locations={locations}
        onClose={() => setAddModalVisible(false)}
        onSaved={() => {
          setAddModalVisible(false);
          loadRecords();
        }}
      />

      <Modal visible={selectedSelfie !== null} transparent animationType="fade" onRequestClose={() => setSelectedSelfie(null)}>
        <View style={styles.selfieViewerBackdrop}>
          <TouchableOpacity style={styles.selfieViewerClose} onPress={() => setSelectedSelfie(null)}>
            <X size={24} color={theme.neutral[0]} strokeWidth={2} />
          </TouchableOpacity>
          {selectedSelfie ? <Image source={{ uri: normalizeSelfieData(selectedSelfie) }} style={styles.selfieViewerImage} resizeMode="contain" /> : null}
        </View>
      </Modal>

      <ConfirmDialog
        visible={deleteTarget !== null}
        options={{
          title: 'Delete Record',
          message: `Delete ${deleteTarget?.type === 'check_in' ? 'check-in' : 'check-out'} for ${deleteTarget?.employee_name}?`,
          confirmText: 'Delete',
          destructive: true,
        }}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}

function normalizeSelfieData(data: string): string {
  const firstDataUrl = data.indexOf('data:');
  const normalized = firstDataUrl >= 0 ? data.slice(firstDataUrl) : `data:image/jpeg;base64,${data}`;
  const nestedDataUrl = normalized.indexOf('data:', 5);
  return nestedDataUrl >= 0 ? normalized.slice(nestedDataUrl) : normalized;
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.filterChip, active && styles.filterChipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AddRecordModal({
  visible,
  employees,
  locations,
  onClose,
  onSaved,
}: {
  visible: boolean;
  employees: Employee[];
  locations: WorkLocation[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [recordType, setRecordType] = useState<AttendanceType>('check_in');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(
    new Date().toTimeString().split(' ')[0].substring(0, 5)
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setSelectedEmployee(employees[0]?.id || '');
      setSelectedLocation(locations[0]?.id || '');
      setRecordType('check_in');
      setDate(new Date().toISOString().split('T')[0]);
      setTime(new Date().toTimeString().split(' ')[0].substring(0, 5));
      setNote('');
      setError('');
    }
  }, [visible, employees, locations]);

  async function handleSave() {
    if (!selectedEmployee || !selectedLocation) {
      setError('Please select employee and location');
      return;
    }

    setSaving(true);
    setError('');

    const timestamp = new Date(`${date}T${time}`).toISOString();

    const { error: insertError } = await supabase.from('attendance_records').insert({
      employee_id: selectedEmployee,
      work_location_id: selectedLocation,
      type: recordType,
      latitude: locations.find((l) => l.id === selectedLocation)?.latitude || 0,
      longitude: locations.find((l) => l.id === selectedLocation)?.longitude || 0,
      timestamp,
      note: note.trim() || null,
    });

    setSaving(false);

    if (insertError) {
      setError('Failed to add record');
    } else {
      onSaved();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Attendance Record</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={24} color={theme.neutral[600]} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.modalContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Employee</Text>
            <View style={styles.pickerContainer}>
              {employees.map((e) => (
                <TouchableOpacity
                  key={e.id}
                  style={[
                    styles.pickerItem,
                    selectedEmployee === e.id && styles.pickerItemActive,
                  ]}
                  onPress={() => setSelectedEmployee(e.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      selectedEmployee === e.id && styles.pickerItemTextActive,
                    ]}
                  >
                    {e.full_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Location</Text>
            <View style={styles.pickerContainer}>
              {locations.map((l) => (
                <TouchableOpacity
                  key={l.id}
                  style={[
                    styles.pickerItem,
                    selectedLocation === l.id && styles.pickerItemActive,
                  ]}
                  onPress={() => setSelectedLocation(l.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      selectedLocation === l.id && styles.pickerItemTextActive,
                    ]}
                  >
                    {l.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Type</Text>
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  recordType === 'check_in' && { backgroundColor: theme.accent[600] },
                ]}
                onPress={() => setRecordType('check_in')}
                activeOpacity={0.7}
              >
                <TrainFront
                  size={18}
                  color={recordType === 'check_in' ? theme.neutral[0] : theme.neutral[500]}
                  strokeWidth={2}
                />
                <Text
                  style={[
                    styles.typeOptionText,
                    recordType === 'check_in' && { color: theme.neutral[0] },
                  ]}
                >
                  Check In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  recordType === 'check_out' && { backgroundColor: theme.warning[500] },
                ]}
                onPress={() => setRecordType('check_out')}
                activeOpacity={0.7}
              >
                <LogOut
                  size={18}
                  color={recordType === 'check_out' ? theme.neutral[0] : theme.neutral[500]}
                  strokeWidth={2}
                />
                <Text
                  style={[
                    styles.typeOptionText,
                    recordType === 'check_out' && { color: theme.neutral[0] },
                  ]}
                >
                  Check Out
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>Date</Text>
              <TextInput
                style={styles.formInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.neutral[400]}
                value={date}
                onChangeText={setDate}
              />
            </View>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>Time</Text>
              <TextInput
                style={styles.formInput}
                placeholder="HH:MM"
                placeholderTextColor={theme.neutral[400]}
                value={time}
                onChangeText={setTime}
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Note (optional)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Add a note..."
              placeholderTextColor={theme.neutral[400]}
              value={note}
              onChangeText={setNote}
              multiline
            />
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <Text style={styles.saveBtnText}>Saving...</Text>
            ) : (
              <Text style={styles.saveBtnText}>Add Record</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: theme.spacing.xxl }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral[50],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.neutral[50],
  },
  exportRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    paddingBottom: 0,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: theme.neutral[200],
  },
  exportBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[600],
  },
  filtersPanel: {
    backgroundColor: theme.neutral[0],
    margin: theme.spacing.md,
    marginBottom: 0,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.neutral[200],
  },
  filterGroup: {
    gap: theme.spacing.xs,
  },
  filterLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.xs,
    color: theme.neutral[400],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  filterChip: {
    backgroundColor: theme.neutral[100],
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginRight: theme.spacing.sm,
  },
  filterChipActive: {
    backgroundColor: theme.primary[600],
  },
  filterChipText: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[500],
  },
  filterChipTextActive: {
    color: theme.neutral[0],
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryText: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[500],
  },
  clearFiltersText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.sm,
    color: theme.primary[600],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.error[50],
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderWidth: 1,
    borderColor: theme.error[100],
  },
  errorBannerText: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.sm,
    color: theme.error[600],
  },
  emptyState: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xxl * 2,
  },
  emptyTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.xl,
    color: theme.neutral[600],
  },
  emptySubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.md,
    color: theme.neutral[400],
    textAlign: 'center',
  },
  recordsList: {
    gap: theme.spacing.sm,
  },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md + 2,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.neutral[200],
  },
  recordTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordDetails: {
    flex: 1,
    gap: 2,
  },
  recordEmployee: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.md,
    color: theme.neutral[800],
  },
  recordMeta: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[400],
  },
  recordDate: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.xs,
    color: theme.neutral[400],
    marginTop: 2,
  },
  recordRight: {
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  selfieThumbnail: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.neutral[100],
  },
  selfieViewerBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    padding: theme.spacing.lg,
  },
  selfieViewerClose: {
    position: 'absolute',
    top: theme.spacing.xl,
    right: theme.spacing.lg,
    zIndex: 1,
    padding: theme.spacing.sm,
  },
  selfieViewerImage: {
    width: '100%',
    height: '80%',
  },
  typeBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
  },
  typeBadgeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
  },
  deleteBtn: {
    padding: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.neutral[50],
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.neutral[0],
    borderBottomWidth: 1,
    borderBottomColor: theme.neutral[200],
  },
  modalTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.lg,
    color: theme.neutral[800],
  },
  modalContent: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  formGroup: {
    gap: theme.spacing.xs,
  },
  formLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[600],
  },
  formInput: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.md,
    color: theme.neutral[800],
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: theme.neutral[200],
  },
  formRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  pickerItem: {
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: theme.neutral[200],
  },
  pickerItemActive: {
    backgroundColor: theme.primary[600],
    borderColor: theme.primary[600],
  },
  pickerItemText: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[500],
  },
  pickerItemTextActive: {
    color: theme.neutral[0],
  },
  typeSelector: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  typeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: theme.neutral[200],
  },
  typeOptionText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.md,
    color: theme.neutral[500],
  },
  errorBox: {
    backgroundColor: theme.error[50],
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.error[100],
  },
  errorText: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.sm,
    color: theme.error[600],
    textAlign: 'center',
  },
  saveBtn: {
    backgroundColor: theme.primary[600],
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md + 2,
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.lg,
    color: theme.neutral[0],
  },
});

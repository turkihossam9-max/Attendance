import { useState, useEffect } from 'react';
import { Redirect } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Plus, Users, Trash2, Pencil, X, User, Shield, Crown, Search, Lock, Clock as Unlock, Smartphone } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { useAuth, hashPassword } from '@/lib/auth';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { Employee, EmployeeRole } from '@/types/database';

function roleLabel(role: EmployeeRole): string {
  if (role === 'owner') return 'Owner';
  if (role === 'manager') return 'HR';
  return 'Employee';
}

function roleColor(role: EmployeeRole): string {
  if (role === 'owner') return theme.warning[600];
  if (role === 'manager') return theme.primary[600];
  return theme.accent[600];
}

function roleBg(role: EmployeeRole): string {
  if (role === 'owner') return theme.warning[50];
  if (role === 'manager') return theme.primary[50];
  return theme.accent[50];
}

function roleAvatarBg(role: EmployeeRole): string {
  if (role === 'owner') return theme.warning[500];
  if (role === 'manager') return theme.primary[600];
  return theme.accent[600];
}

function roleIcon(role: EmployeeRole, size: number = 12) {
  if (role === 'owner') return <Crown size={size} color={roleColor(role)} strokeWidth={2} />;
  if (role === 'manager') return <Shield size={size} color={roleColor(role)} strokeWidth={2} />;
  return <User size={size} color={roleColor(role)} strokeWidth={2} />;
}

export default function EmployeesScreen() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [lockTarget, setLockTarget] = useState<Employee | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    setLoading(true);
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('full_name');
    if (!error && data) {
      setEmployees(data as Employee[]);
    }
    setLoading(false);
  }

  function openAdd() {
    setEditingEmployee(null);
    setModalVisible(true);
  }

  function openEdit(emp: Employee) {
    if (emp.role === 'owner' && !isOwner) {
      setActionError('Only the owner can edit their own account');
      return;
    }
    setEditingEmployee(emp);
    setModalVisible(true);
  }

  function handleDeleteClick(emp: Employee) {
    if (emp.role === 'owner') {
      setActionError('The owner account cannot be deleted');
      return;
    }
    if (emp.id === user?.id) {
      setActionError('You cannot delete your own account');
      return;
    }
    setDeleteTarget(emp);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('employees').delete().eq('id', deleteTarget.id);
    if (error) {
      setActionError('Failed to delete employee');
    } else {
      setDeleteTarget(null);
      loadEmployees();
    }
  }

  function handleLockClickInner(emp: Employee) {
    if (emp.role === 'owner') {
      setActionError('Cannot lock the owner account');
      return;
    }
    setLockTarget(emp);
  }

  async function confirmLockToggle() {
    if (!lockTarget) return;
    const newActive = !lockTarget.active;
    const { error } = await supabase
      .from('employees')
      .update({
        active: newActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lockTarget.id);
    if (error) {
      setActionError('Failed to update employee status');
    } else {
      setLockTarget(null);
      loadEmployees();
    }
  }

  const filtered = employees.filter(
    (e) =>
      e.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const ownerCount = employees.filter((e) => e.role === 'owner').length;
  const managerCount = employees.filter((e) => e.role === 'manager').length;
  const employeeCount = employees.filter((e) => e.role === 'employee').length;

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
      <View style={styles.searchBar}>
        <Search size={20} color={theme.neutral[400]} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search employees..."
          placeholderTextColor={theme.neutral[400]}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{employees.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{ownerCount}</Text>
            <Text style={styles.statLabel}>Owners</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{managerCount}</Text>
            <Text style={styles.statLabel}>HR</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{employeeCount}</Text>
            <Text style={styles.statLabel}>Staff</Text>
          </View>
        </View>

        {actionError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{actionError}</Text>
            <TouchableOpacity onPress={() => setActionError('')}>
              <X size={16} color={theme.error[600]} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        ) : null}

        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Users size={48} color={theme.neutral[300]} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No Employees Found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery ? 'Try a different search' : 'Add your first employee'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity style={styles.emptyAddBtn} onPress={openAdd} activeOpacity={0.8}>
                <Plus size={20} color={theme.neutral[0]} strokeWidth={2} />
                <Text style={styles.emptyAddBtnText}>Add Employee</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.employeeList}>
            {filtered.map((emp) => {
              const canEdit = isOwner || emp.role === 'employee';
              const canDelete = emp.role !== 'owner' && emp.id !== user?.id;
              const canLock = emp.role !== 'owner' && emp.id !== user?.id;
              return (
                <View key={emp.id} style={styles.employeeCard}>
                  <View style={styles.employeeMain}>
                    <View style={[styles.empAvatar, { backgroundColor: roleAvatarBg(emp.role) }]}>
                      <Text style={styles.empAvatarText}>
                        {emp.full_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.empInfo}>
                      <Text style={styles.empName}>{emp.full_name}</Text>
                      <Text style={styles.empUsername}>@{emp.username}</Text>
                      <View style={styles.empBadges}>
                        <View style={[styles.roleBadge, { backgroundColor: roleBg(emp.role) }]}>
                          {roleIcon(emp.role)}
                          <Text style={[styles.roleBadgeText, { color: roleColor(emp.role) }]}>
                            {roleLabel(emp.role)}
                          </Text>
                        </View>
                        {!emp.active && (
                          <View style={[styles.roleBadge, { backgroundColor: theme.error[50] }]}>
                            <Lock size={10} color={theme.error[600]} strokeWidth={2} />
                            <Text style={[styles.roleBadgeText, { color: theme.error[600] }]}>
                              Locked
                            </Text>
                          </View>
                        )}
                        {emp.id === user?.id && (
                          <View style={[styles.roleBadge, { backgroundColor: theme.primary[50] }]}>
                            <Text style={[styles.roleBadgeText, { color: theme.primary[600] }]}>
                              You
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.empActions}>
                      {canEdit && (
                        <TouchableOpacity
                          onPress={() => openEdit(emp)}
                          style={styles.iconBtn}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Pencil size={18} color={theme.neutral[500]} strokeWidth={2} />
                        </TouchableOpacity>
                      )}
                      {canLock && (
                        <TouchableOpacity
                          onPress={() => handleLockClickInner(emp)}
                          style={styles.iconBtn}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          {emp.active ? (
                            <Lock size={18} color={theme.warning[500]} strokeWidth={2} />
                          ) : (
                            <Unlock size={18} color={theme.accent[500]} strokeWidth={2} />
                          )}
                        </TouchableOpacity>
                      )}
                      {canDelete && (
                        <TouchableOpacity
                          onPress={() => handleDeleteClick(emp)}
                          style={styles.iconBtn}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Trash2 size={18} color={theme.error[500]} strokeWidth={2} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  {emp.device_info && (
                    <View style={styles.deviceRow}>
                      <Smartphone size={13} color={theme.neutral[400]} strokeWidth={2} />
                      <Text style={styles.deviceText}>Last login: {emp.device_info}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
        <View style={{ height: theme.spacing.xxl }} />
      </ScrollView>

      {filtered.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
          <Plus size={26} color={theme.neutral[0]} strokeWidth={2} />
        </TouchableOpacity>
      )}

      <EmployeeModal
        visible={modalVisible}
        employee={editingEmployee}
        isOwner={isOwner}
        onClose={() => setModalVisible(false)}
        onSaved={() => {
          setModalVisible(false);
          loadEmployees();
        }}
      />

      <ConfirmDialog
        visible={deleteTarget !== null}
        options={{
          title: 'Delete Employee',
          message: `Are you sure you want to delete "${deleteTarget?.full_name}"? This cannot be undone.`,
          confirmText: 'Delete',
          destructive: true,
        }}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        visible={lockTarget !== null}
        options={{
          title: lockTarget?.active ? 'Lock Account' : 'Unlock Account',
          message: lockTarget?.active
            ? `Lock "${lockTarget?.full_name}"? They will be signed out immediately and cannot log in until unlocked.`
            : `Unlock "${lockTarget?.full_name}"? They will be able to log in again from a new device.`,
          confirmText: lockTarget?.active ? 'Lock' : 'Unlock',
          destructive: lockTarget?.active,
        }}
        onConfirm={confirmLockToggle}
        onCancel={() => setLockTarget(null)}
      />
    </View>
  );
}

function EmployeeModal({
  visible,
  employee,
  isOwner,
  onClose,
  onSaved,
}: {
  visible: boolean;
  employee: Employee | null;
  isOwner: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<EmployeeRole>('employee');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      if (employee) {
        setFullName(employee.full_name);
        setUsername(employee.username);
        setPassword('');
        setRole(employee.role);
        setActive(employee.active);
      } else {
        setFullName('');
        setUsername('');
        setPassword('');
        setRole('employee');
        setActive(true);
      }
      setError('');
    }
  }, [visible, employee]);

  const availableRoles: EmployeeRole[] = isOwner
    ? ['employee', 'manager', 'owner']
    : ['employee', 'manager'];

  async function handleSave() {
    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }
    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (!employee && !password.trim()) {
      setError('Password is required for new employees');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (employee) {
        const payload: any = {
          full_name: fullName.trim(),
          username: username.trim(),
          role,
          active,
          updated_at: new Date().toISOString(),
        };
        if (password.trim()) {
          payload.password_hash = await hashPassword(password);
        }
        const { error: updateError } = await supabase
          .from('employees')
          .update(payload)
          .eq('id', employee.id);
        if (updateError) {
          if (updateError.message.includes('duplicate')) {
            setError('Username already exists');
          } else {
            setError('Failed to update employee');
          }
          setSaving(false);
          return;
        }
      } else {
        const hashed = await hashPassword(password);
        const { error: insertError } = await supabase.from('employees').insert({
          full_name: fullName.trim(),
          username: username.trim(),
          password_hash: hashed,
          role,
          active,
        });
        if (insertError) {
          if (insertError.message.includes('duplicate')) {
            setError('Username already exists');
          } else {
            setError('Failed to add employee');
          }
          setSaving(false);
          return;
        }
      }
      setSaving(false);
      onSaved();
    } catch {
      setError('An unexpected error occurred');
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {employee ? 'Edit Employee' : 'Add Employee'}
          </Text>
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
            <Text style={styles.formLabel}>Full Name</Text>
            <TextInput
              style={styles.formInput}
              placeholder="John Doe"
              placeholderTextColor={theme.neutral[400]}
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Username</Text>
            <TextInput
              style={styles.formInput}
              placeholder="johndoe"
              placeholderTextColor={theme.neutral[400]}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>
              {employee ? 'New Password (leave blank to keep current)' : 'Password'}
            </Text>
            <TextInput
              style={styles.formInput}
              placeholder="••••••••"
              placeholderTextColor={theme.neutral[400]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Role</Text>
            <View style={styles.roleSelector}>
              {availableRoles.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.roleOption,
                    role === r && { backgroundColor: roleAvatarBg(r), borderColor: roleAvatarBg(r) },
                  ]}
                  onPress={() => setRole(r)}
                  activeOpacity={0.7}
                >
                  {roleIcon(r, 18)}
                  <Text
                    style={[
                      styles.roleOptionText,
                      role === r && { color: theme.neutral[0] },
                    ]}
                  >
                    {roleLabel(r)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setActive(!active)}
            activeOpacity={0.7}
          >
            <View style={[styles.toggle, active && styles.toggleActive]}>
              <View style={[styles.toggleKnob, active && styles.toggleKnobActive]} />
            </View>
            <Text style={styles.toggleLabel}>Active Account</Text>
          </TouchableOpacity>

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
              <Text style={styles.saveBtnText}>
                {employee ? 'Update Employee' : 'Add Employee'}
              </Text>
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.neutral[0],
    margin: theme.spacing.md,
    marginBottom: 0,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: theme.neutral[200],
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.md,
    color: theme.neutral[800],
    paddingVertical: 0,
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.neutral[200],
  },
  statValue: {
    fontFamily: 'Inter-Bold',
    fontSize: theme.fontSize.xxl,
    color: theme.neutral[800],
  },
  statLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.xs,
    color: theme.neutral[400],
    marginTop: 2,
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
    paddingHorizontal: theme.spacing.xl,
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
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.primary[600],
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  emptyAddBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.md,
    color: theme.neutral[0],
  },
  employeeList: {
    gap: theme.spacing.sm + 2,
  },
  employeeCard: {
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md + 2,
    borderWidth: 1,
    borderColor: theme.neutral[200],
  },
  employeeMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  empAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empAvatarText: {
    fontFamily: 'Inter-Bold',
    fontSize: theme.fontSize.lg,
    color: theme.neutral[0],
  },
  empInfo: {
    flex: 1,
    gap: 3,
  },
  empName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.md,
    color: theme.neutral[800],
  },
  empUsername: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.xs,
    color: theme.neutral[400],
  },
  empBadges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  roleBadgeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
  },
  empActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  iconBtn: {
    padding: theme.spacing.xs,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.neutral[100],
  },
  deviceText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.xs,
    color: theme.neutral[400],
  },
  fab: {
    position: 'absolute',
    bottom: theme.spacing.lg + 60,
    right: theme.spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.primary[600],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
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
  roleSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: theme.neutral[200],
  },
  roleOptionText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.md,
    color: theme.neutral[500],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm + 2,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.neutral[300],
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleActive: {
    backgroundColor: theme.accent[500],
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.neutral[0],
    alignSelf: 'flex-start',
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  toggleLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.md,
    color: theme.neutral[600],
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

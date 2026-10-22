import { useState, useEffect, useRef } from 'react';
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
  Platform,
} from 'react-native';
import { MapView } from '@/components/MapView';
import {
  MapPin,
  Plus,
  Search,
  Trash2,
  Pencil,
  X,
  Navigation,
  CircleDot,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { WorkLocation } from '@/types/database';
import { haversineDistance, formatDistance, type Coords } from '@/lib/geo';

export default function LocationsScreen() {
  const { user } = useAuth();
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLocation, setEditingLocation] = useState<WorkLocation | null>(null);
  const [currentCoords, setCurrentCoords] = useState<Coords | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkLocation | null>(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    loadLocations();
    getCurrentLocation();
  }, []);

  async function loadLocations() {
    setLoading(true);
    const { data, error } = await supabase
      .from('work_locations')
      .select('*')
      .order('name');
    if (!error && data) {
      setLocations(data as WorkLocation[]);
    }
    setLoading(false);
  }

  function getCurrentLocation() {
    if (Platform.OS === 'web' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000 }
      );
    }
  }

  function openAdd() {
    setEditingLocation(null);
    setModalVisible(true);
  }

  function openEdit(loc: WorkLocation) {
    setEditingLocation(loc);
    setModalVisible(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from('work_locations')
      .delete()
      .eq('id', deleteTarget.id);
    if (error) {
      setDeleteError('Failed to delete location');
    } else {
      setDeleteTarget(null);
      loadLocations();
    }
  }

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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {locations.length === 0 ? (
          <View style={styles.emptyState}>
            <MapPin size={48} color={theme.neutral[300]} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No Locations Yet</Text>
            <Text style={styles.emptySubtitle}>
              Add work locations where employees can check in
            </Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={openAdd} activeOpacity={0.8}>
              <Plus size={20} color={theme.neutral[0]} strokeWidth={2} />
              <Text style={styles.emptyAddBtnText}>Add Location</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.locationsList}>
            {locations.map((loc) => {
              const dist = currentCoords
                ? haversineDistance(currentCoords, loc)
                : null;
              return (
                <View key={loc.id} style={styles.locationCard}>
                  <View style={styles.locationHeader}>
                    <View style={styles.locationIcon}>
                      <MapPin size={20} color={theme.primary[600]} strokeWidth={2} />
                    </View>
                    <View style={styles.locationInfo}>
                      <Text style={styles.locationName}>{loc.name}</Text>
                      {loc.address ? (
                        <Text style={styles.locationAddress} numberOfLines={2}>
                          {loc.address}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.locationActions}>
                      <TouchableOpacity
                        onPress={() => openEdit(loc)}
                        style={styles.iconBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Pencil size={18} color={theme.neutral[500]} strokeWidth={2} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setDeleteTarget(loc)}
                        style={styles.iconBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Trash2 size={18} color={theme.error[500]} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.locationFooter}>
                    <View style={styles.footerItem}>
                      <CircleDot size={14} color={theme.neutral[400]} strokeWidth={2} />
                      <Text style={styles.footerText}>Radius: {loc.radius_meters}m</Text>
                    </View>
                    {dist !== null && (
                      <View style={styles.footerItem}>
                        <Navigation size={14} color={theme.neutral[400]} strokeWidth={2} />
                        <Text style={styles.footerText}>{formatDistance(dist)} from you</Text>
                      </View>
                    )}
                    <View
                      style={[
                        styles.activeBadge,
                        loc.active ? { backgroundColor: theme.accent[50] } : { backgroundColor: theme.neutral[100] },
                      ]}
                    >
                      <View
                        style={[
                          styles.activeDot,
                          { backgroundColor: loc.active ? theme.accent[500] : theme.neutral[400] },
                        ]}
                      />
                      <Text
                        style={[
                          styles.activeText,
                          { color: loc.active ? theme.accent[700] : theme.neutral[500] },
                        ]}
                      >
                        {loc.active ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
        <View style={{ height: theme.spacing.xxl }} />
      </ScrollView>

      {locations.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
          <Plus size={26} color={theme.neutral[0]} strokeWidth={2} />
        </TouchableOpacity>
      )}

      <LocationModal
        visible={modalVisible}
        location={editingLocation}
        currentCoords={currentCoords}
        onClose={() => setModalVisible(false)}
        onSaved={() => {
          setModalVisible(false);
          loadLocations();
        }}
      />

      <ConfirmDialog
        visible={deleteTarget !== null}
        options={{
          title: 'Delete Location',
          message: `Are you sure you want to delete "${deleteTarget?.name}"?`,
          confirmText: 'Delete',
          destructive: true,
        }}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {deleteError ? (
        <View style={styles.deleteErrorBanner} pointerEvents="box-none">
          <Text style={styles.deleteErrorText}>{deleteError}</Text>
        </View>
      ) : null}
    </View>
  );
}

function LocationModal({
  visible,
  location,
  currentCoords,
  onClose,
  onSaved,
}: {
  visible: boolean;
  location: WorkLocation | null;
  currentCoords: Coords | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('100');
  const [active, setActive] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ name: string; lat: number; lng: number; address: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mapKey, setMapKey] = useState(0);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      if (location) {
        setName(location.name);
        setAddress(location.address || '');
        setLat(String(location.latitude));
        setLng(String(location.longitude));
        setRadius(String(location.radius_meters));
        setActive(location.active);
      } else {
        setName('');
        setAddress('');
        setLat(currentCoords ? String(currentCoords.latitude) : '');
        setLng(currentCoords ? String(currentCoords.longitude) : '');
        setRadius('100');
        setActive(true);
      }
      setSearchQuery('');
      setSearchResults([]);
      setError('');
      setMapKey((k) => k + 1);
    }
  }, [visible, location, currentCoords]);

  async function performSearch(query: string) {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en' },
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(
          data.map((r: any) => ({
            name: r.display_name.split(',')[0],
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
            address: r.display_name,
          }))
        );
      }
    } catch {
      // ignore
    }
    setSearching(false);
  }

  function onSearchChange(text: string) {
    setSearchQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => performSearch(text), 500);
  }

  function selectSearchResult(r: { name: string; lat: number; lng: number; address: string }) {
    setLat(String(r.lat));
    setLng(String(r.lng));
    setAddress(r.address);
    if (!name) setName(r.name);
    setSearchQuery(r.name);
    setSearchResults([]);
    setMapKey((k) => k + 1);
  }

  function useMyLocation() {
    if (currentCoords) {
      setLat(String(currentCoords.latitude));
      setLng(String(currentCoords.longitude));
      setMapKey((k) => k + 1);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Location name is required');
      return;
    }
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = parseInt(radius, 10);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setError('Invalid latitude');
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setError('Invalid longitude');
      return;
    }
    if (isNaN(radiusNum) || radiusNum < 10) {
      setError('Radius must be at least 10m');
      return;
    }

    setSaving(true);
    setError('');

    const payload = {
      name: name.trim(),
      address: address.trim() || null,
      latitude: latNum,
      longitude: lngNum,
      radius_meters: radiusNum,
      active,
    };

    let result;
    if (location) {
      result = await supabase.from('work_locations').update(payload).eq('id', location.id);
    } else {
      result = await supabase.from('work_locations').insert(payload);
    }

    setSaving(false);

    if (result.error) {
      setError('Failed to save location');
    } else {
      onSaved();
    }
  }

  const latNum = parseFloat(lat) || 0;
  const lngNum = parseFloat(lng) || 0;
  const radiusNum = parseInt(radius, 10) || 100;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {location ? 'Edit Location' : 'Add Location'}
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
          {/* Search */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputRow}>
              <Search size={20} color={theme.neutral[400]} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for a location..."
                placeholderTextColor={theme.neutral[400]}
                value={searchQuery}
                onChangeText={onSearchChange}
              />
              {searching && <ActivityIndicator size="small" color={theme.primary[600]} />}
            </View>
            {searchResults.length > 0 && (
              <View style={styles.searchResults}>
                {searchResults.map((r, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.searchResultItem}
                    onPress={() => selectSearchResult(r)}
                    activeOpacity={0.7}
                  >
                    <MapPin size={18} color={theme.primary[500]} strokeWidth={2} />
                    <View style={styles.searchResultInfo}>
                      <Text style={styles.searchResultName} numberOfLines={1}>{r.name}</Text>
                      <Text style={styles.searchResultAddr} numberOfLines={1}>{r.address}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Map preview */}
          <View style={styles.modalMapContainer}>
            <MapView
              key={mapKey}
              html={generateLocationMapHtml(latNum, lngNum, radiusNum, name)}
              style={styles.modalMap}
              onMessage={(data) => {
                const parts = data.split(',');
                if (parts.length === 2) {
                  setLat(parts[0]);
                  setLng(parts[1]);
                }
              }}
            />
            <TouchableOpacity style={styles.myLocationBtn} onPress={useMyLocation} activeOpacity={0.8}>
              <Navigation size={16} color={theme.neutral[0]} strokeWidth={2} />
              <Text style={styles.myLocationBtnText}>My Location</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Location Name</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., Main Office"
              placeholderTextColor={theme.neutral[400]}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Address</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Street, City, Country"
              placeholderTextColor={theme.neutral[400]}
              value={address}
              onChangeText={setAddress}
              multiline
            />
          </View>

          <View style={styles.formRow}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>Latitude</Text>
              <TextInput
                style={styles.formInput}
                placeholder="0.0000"
                placeholderTextColor={theme.neutral[400]}
                value={lat}
                onChangeText={setLat}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>Longitude</Text>
              <TextInput
                style={styles.formInput}
                placeholder="0.0000"
                placeholderTextColor={theme.neutral[400]}
                value={lng}
                onChangeText={setLng}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Radius (meters)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="100"
              placeholderTextColor={theme.neutral[400]}
              value={radius}
              onChangeText={setRadius}
              keyboardType="number-pad"
            />
          </View>

          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setActive(!active)}
            activeOpacity={0.7}
          >
            <View style={[styles.toggle, active && styles.toggleActive]}>
              <View style={[styles.toggleKnob, active && styles.toggleKnobActive]} />
            </View>
            <Text style={styles.toggleLabel}>Active</Text>
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
              <Text style={styles.saveBtnText}>{location ? 'Update Location' : 'Add Location'}</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: theme.spacing.xxl }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function generateLocationMapHtml(lat: number, lng: number, radius: number, name: string): string {
  const locName = JSON.stringify(name || 'Location');
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    body, html { margin: 0; padding: 0; height: 100%; width: 100%; }
    #map { height: 100%; width: 100%; background: #e2e8f0; }
    .loc-marker { background: #2563eb; border: 3px solid #fff; border-radius: 50%; width: 16px; height: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    (function() {
      var map = L.map('map', { zoomControl: false, attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: 'abc',
      }).addTo(map);

      var locLatLng = [${lat}, ${lng}];
      var locIcon = L.divIcon({ className: 'loc-marker', iconSize: [16, 16], iconAnchor: [8, 8] });

      var marker = L.marker(locLatLng, { icon: locIcon, draggable: true }).addTo(map).bindPopup(${locName});

      L.circle(locLatLng, {
        radius: ${radius},
        color: '#2563eb',
        weight: 2,
        opacity: 0.6,
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
      }).addTo(map);

      map.setView(locLatLng, 16);

      marker.on('dragend', function(e) {
        var ll = e.target.getLatLng();
        var msg = ll.lat.toFixed(6) + ',' + ll.lng.toFixed(6);
        try { parent.postMessage(msg, '*'); } catch(e) {}
        try { window.parent.postMessage(msg, '*'); } catch(e) {}
      });
    })();
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral[50],
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.neutral[50],
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
  locationsList: {
    gap: theme.spacing.md,
  },
  locationCard: {
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md + 2,
    borderWidth: 1,
    borderColor: theme.neutral[200],
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.primary[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationInfo: {
    flex: 1,
    gap: 2,
  },
  locationName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.md,
    color: theme.neutral[800],
  },
  locationAddress: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[400],
  },
  locationActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  iconBtn: {
    padding: theme.spacing.xs,
  },
  locationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.neutral[100],
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.xs,
    color: theme.neutral[500],
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    marginLeft: 'auto',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeText: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.xs,
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
  // Modal styles
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
  searchContainer: {
    gap: theme.spacing.xs,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
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
  searchResults: {
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.neutral[200],
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.neutral[100],
  },
  searchResultInfo: {
    flex: 1,
    gap: 2,
  },
  searchResultName: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[700],
  },
  searchResultAddr: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.xs,
    color: theme.neutral[400],
  },
  modalMapContainer: {
    height: 200,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.neutral[200],
    position: 'relative',
  },
  modalMap: {
    flex: 1,
  },
  myLocationBtn: {
    position: 'absolute',
    bottom: theme.spacing.sm,
    right: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.primary[600],
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radius.pill,
    shadowColor: theme.neutral[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  myLocationBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.xs,
    color: theme.neutral[0],
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
  deleteErrorBanner: {
    position: 'absolute',
    bottom: theme.spacing.lg + 80,
    left: theme.spacing.md,
    right: theme.spacing.md,
    backgroundColor: theme.error[600],
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
  },
  deleteErrorText: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[0],
    textAlign: 'center',
  },
});

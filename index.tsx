import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MapView } from '@/components/MapView';
import {
  TrainFront,
  LogOut,
  MapPin,
  Clock,
  Navigation,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Camera,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import type { WorkLocation, AttendanceRecord, AttendanceType } from '@/types/database';
import { haversineDistance, formatDistance, type Coords } from '@/lib/geo';
import { formatTime } from '@/lib/time';

export default function AttendanceScreen() {
  const { user } = useAuth();
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<WorkLocation | null>(null);
  const [currentCoords, setCurrentCoords] = useState<Coords | null>(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [gpsError, setGpsError] = useState('');
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [lastRecord, setLastRecord] = useState<AttendanceRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selfieModalVisible, setSelfieModalVisible] = useState(false);
  const [pendingAttendanceType, setPendingAttendanceType] = useState<AttendanceType | null>(null);
  const [selfieError, setSelfieError] = useState('');
  const [capturingSelfie, setCapturingSelfie] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    loadLocations();
    getCurrentLocation();
  }, []);

  useEffect(() => {
    if (user) {
      loadTodayRecords();
    }
  }, [user]);

  useEffect(() => {
    if (locations.length === 0) return;
    if (!currentCoords) {
      if (!selectedLocation) setSelectedLocation(locations[0]);
      return;
    }
    const nearest = locations.reduce((closest, location) => {
      const closestDistance = haversineDistance(currentCoords, closest);
      const locationDistance = haversineDistance(currentCoords, location);
      return locationDistance < closestDistance ? location : closest;
    }, locations[0]);
    setSelectedLocation(nearest);
  }, [locations, currentCoords]);

  useEffect(() => {
    const activeCheckIn = lastRecord?.type === 'check_in' ? lastRecord : null;
    if (!activeCheckIn) {
      setElapsedSeconds(0);
      return;
    }
    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - new Date(activeCheckIn.timestamp).getTime()) / 1000)));
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [lastRecord]);

  async function loadLocations() {
    const { data, error } = await supabase
      .from('work_locations')
      .select('*')
      .eq('active', true)
      .order('name');
    if (!error && data) {
      setLocations(data as WorkLocation[]);
    }
  }

  async function getCurrentLocation() {
    setGpsLoading(true);
    setGpsError('');
    try {
      if (Platform.OS === 'web' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setCurrentCoords({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
            setGpsLoading(false);
            setMapKey((k) => k + 1);
          },
          (err) => {
            setGpsError(err.message || 'Unable to get GPS location');
            setGpsLoading(false);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      } else {
        setGpsError('Geolocation not available on this platform');
        setGpsLoading(false);
      }
    } catch {
      setGpsError('Failed to access GPS');
      setGpsLoading(false);
    }
  }

  async function loadTodayRecords() {
    if (!user) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('employee_id', user.id)
      .gte('timestamp', startOfDay.toISOString())
      .order('timestamp', { ascending: false });

    if (data) {
      setTodayRecords(data as AttendanceRecord[]);
      setLastRecord((data[0] as AttendanceRecord) || null);
    }
  }

  const distance = selectedLocation && currentCoords
    ? haversineDistance(currentCoords, selectedLocation)
    : null;
  const activeCheckIn = lastRecord?.type === 'check_in' ? lastRecord : null;
  const elapsedHours = Math.floor(elapsedSeconds / 3600);
  const elapsedMinutes = Math.floor((elapsedSeconds % 3600) / 60);
  const elapsedRemainder = elapsedSeconds % 60;
  const elapsedLabel = `${String(elapsedHours).padStart(2, '0')}:${String(elapsedMinutes).padStart(2, '0')}:${String(elapsedRemainder).padStart(2, '0')}`;

  const withinRange = distance !== null && selectedLocation
    ? distance <= selectedLocation.radius_meters
    : false;

  const canCheckIn = useCallback((): { allowed: boolean; reason?: string } => {
    if (!lastRecord) return { allowed: true };
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const lastTime = new Date(lastRecord.timestamp);
    if (lastTime > oneHourAgo) {
      const minsAgo = Math.round((Date.now() - lastTime.getTime()) / 60000);
      const remaining = 60 - minsAgo;
      return {
        allowed: false,
        reason: `You checked ${lastRecord.type === 'check_in' ? 'in' : 'out'} ${minsAgo}m ago. Please wait ${remaining}m before recording again.`,
      };
    }
    return { allowed: true };
  }, [lastRecord]);

  function beginAttendance(type: AttendanceType) {
    if (!user || !selectedLocation || !currentCoords) return;

    const check = canCheckIn();
    if (!check.allowed) {
      setActionMessage({ type: 'error', text: check.reason! });
      return;
    }

    if (!withinRange) {
      setActionMessage({
        type: 'error',
        text: `You are ${formatDistance(distance!)} from ${selectedLocation.name}. You must be within ${selectedLocation.radius_meters}m to check in.`,
      });
      return;
    }

    setSelfieError('');
    setPendingAttendanceType(type);
    setSelfieModalVisible(true);
  }

  async function captureSelfie() {
    if (!cameraRef.current || !pendingAttendanceType) return;
    setCapturingSelfie(true);
    setSelfieError('');

    try {
      const picture = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
      const selfieData = picture?.base64
        ? normalizeSelfieData(picture.base64)
        : picture?.uri
          ? await imageUriToDataUrl(picture.uri)
          : null;
      if (!selfieData) {
        setSelfieError('The selfie could not be captured. Please try again.');
        setCapturingSelfie(false);
        return;
      }

      await submitAttendance(pendingAttendanceType, selfieData);
      setSelfieModalVisible(false);
      setPendingAttendanceType(null);
    } catch {
      setSelfieError('Camera error. Please allow camera access and try again.');
    } finally {
      setCapturingSelfie(false);
    }
  }

  async function submitAttendance(type: AttendanceType, selfieData: string) {
    if (!user || !selectedLocation || !currentCoords) return;
    setSubmitting(true);
    setActionMessage(null);

    const { error } = await supabase.from('attendance_records').insert({
      employee_id: user.id,
      work_location_id: selectedLocation.id,
      type,
      latitude: currentCoords.latitude,
      longitude: currentCoords.longitude,
      timestamp: new Date().toISOString(),
      selfie_data: selfieData,
    });

    setSubmitting(false);

    if (error) {
      setActionMessage({ type: 'error', text: 'Failed to record attendance. Please try again.' });
    } else {
      setActionMessage({
        type: 'success',
        text: type === 'check_in' ? 'Selfie and check-in recorded successfully!' : 'Selfie and check-out recorded successfully!',
      });
      loadTodayRecords();
    }
  }

  function closeSelfieModal() {
    if (capturingSelfie) return;
    setSelfieModalVisible(false);
    setPendingAttendanceType(null);
    setSelfieError('');
  }

  function refreshGps() {
    getCurrentLocation();
  }

  if (!user) return null;

  const checkResult = canCheckIn();

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* User card */}
      <View style={styles.userCard}>
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user.full_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.userName}>{user.full_name}</Text>
            <Text style={styles.userRole}>
              {user.role === 'owner' ? 'Owner' : user.role === 'manager' ? 'Manager' : 'Employee'}
            </Text>
          </View>
        </View>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: theme.accent[500] }]} />
          <Text style={styles.statusText}>Active</Text>
        </View>
      </View>

      {/* Location selector */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Work Location</Text>
        {locations.length === 0 ? (
          <View style={styles.emptyBox}>
            <MapPin size={24} color={theme.neutral[300]} strokeWidth={2} />
            <Text style={styles.emptyText}>No locations available</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.locationScroll}>
            {locations.map((loc) => {
              const isSelected = selectedLocation?.id === loc.id;
              return (
                <TouchableOpacity
                  key={loc.id}
                  style={[styles.locationChip, isSelected && styles.locationChipActive]}
                  onPress={() => setSelectedLocation(loc)}
                  activeOpacity={0.7}
                >
                  <MapPin
                    size={16}
                    color={isSelected ? theme.neutral[0] : theme.neutral[500]}
                    strokeWidth={2}
                  />
                  <Text
                    style={[
                      styles.locationChipText,
                      isSelected && styles.locationChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Map */}
      {selectedLocation && (
        <View style={styles.mapContainer}>
          <MapView
            key={mapKey}
            html={generateMapHtml(selectedLocation, currentCoords)}
            style={styles.map}
          />
          <View style={styles.mapOverlay}>
            {gpsLoading ? (
              <View style={styles.gpsBadge}>
                <ActivityIndicator size="small" color={theme.primary[600]} />
                <Text style={styles.gpsBadgeText}>Getting GPS...</Text>
              </View>
            ) : gpsError ? (
              <View style={[styles.gpsBadge, { backgroundColor: theme.error[50] }]}>
                <AlertCircle size={16} color={theme.error[600]} strokeWidth={2} />
                <Text style={[styles.gpsBadgeText, { color: theme.error[600] }]}>GPS Error</Text>
              </View>
            ) : currentCoords ? (
              <View style={[styles.gpsBadge, withinRange ? { backgroundColor: theme.accent[50] } : { backgroundColor: theme.warning[50] }]}>
                <Navigation
                  size={16}
                  color={withinRange ? theme.accent[600] : theme.warning[600]}
                  strokeWidth={2}
                />
                <Text
                  style={[
                    styles.gpsBadgeText,
                    { color: withinRange ? theme.accent[700] : theme.warning[700] },
                  ]}
                >
                  {withinRange ? 'In Range' : `${formatDistance(distance!)} away`}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {activeCheckIn && (
        <View style={styles.timerCard}>
          <Clock size={20} color={theme.primary[600]} strokeWidth={2} />
          <View style={styles.timerCopy}>
            <Text style={styles.timerLabel}>Time since check-in</Text>
            <Text style={styles.timerValue}>{elapsedLabel}</Text>
          </View>
          {selectedLocation && <Text style={styles.timerLocation}>{selectedLocation.name}</Text>}
        </View>
      )}

      {/* GPS status & refresh */}
      <View style={styles.gpsRow}>
        <View style={styles.gpsInfo}>
          <Clock size={16} color={theme.neutral[400]} strokeWidth={2} />
          <Text style={styles.gpsInfoText}>
            {currentCoords
              ? `${currentCoords.latitude.toFixed(5)}, ${currentCoords.longitude.toFixed(5)}`
              : gpsError || 'Waiting for GPS...'}
          </Text>
        </View>
        <TouchableOpacity onPress={refreshGps} style={styles.refreshBtn} activeOpacity={0.7}>
          <Navigation size={16} color={theme.primary[600]} strokeWidth={2} />
          <Text style={styles.refreshBtnText}>Refresh GPS</Text>
        </TouchableOpacity>
      </View>

      {/* Action message */}
      {actionMessage && (
        <View
          style={[
            styles.actionMessage,
            actionMessage.type === 'success' && { backgroundColor: theme.accent[50], borderColor: theme.accent[100] },
            actionMessage.type === 'error' && { backgroundColor: theme.error[50], borderColor: theme.error[100] },
            actionMessage.type === 'info' && { backgroundColor: theme.primary[50], borderColor: theme.primary[100] },
          ]}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 size={20} color={theme.accent[600]} strokeWidth={2} />
          ) : actionMessage.type === 'error' ? (
            <XCircle size={20} color={theme.error[600]} strokeWidth={2} />
          ) : (
            <AlertCircle size={20} color={theme.primary[600]} strokeWidth={2} />
          )}
          <Text
            style={[
              styles.actionMessageText,
              { color: actionMessage.type === 'success' ? theme.accent[700] : actionMessage.type === 'error' ? theme.error[700] : theme.primary[700] },
            ]}
          >
            {actionMessage.text}
          </Text>
        </View>
      )}

      {/* Check-in/out buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[
            styles.actionBtn,
            styles.checkInBtn,
            (!withinRange || submitting || !checkResult.allowed) && styles.actionBtnDisabled,
          ]}
          onPress={() => beginAttendance('check_in')}
          disabled={!withinRange || submitting || !checkResult.allowed}
          activeOpacity={0.8}
        >
          <TrainFront size={28} color={theme.neutral[0]} strokeWidth={2} />
          <Text style={styles.actionBtnText}>Check In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionBtn,
            styles.checkOutBtn,
            (!withinRange || submitting || !checkResult.allowed) && styles.actionBtnDisabled,
          ]}
          onPress={() => beginAttendance('check_out')}
          disabled={!withinRange || submitting || !checkResult.allowed}
          activeOpacity={0.8}
        >
          <LogOut size={28} color={theme.neutral[0]} strokeWidth={2} />
          <Text style={styles.actionBtnText}>Check Out</Text>
        </TouchableOpacity>
      </View>

      {!checkResult.allowed && checkResult.reason && !actionMessage && (
        <View style={styles.hourLimitBox}>
          <Clock size={16} color={theme.warning[600]} strokeWidth={2} />
          <Text style={styles.hourLimitText}>{checkResult.reason}</Text>
        </View>
      )}

      {/* Today's records */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Today's Activity</Text>
        {todayRecords.length === 0 ? (
          <View style={styles.emptyBox}>
            <Clock size={24} color={theme.neutral[300]} strokeWidth={2} />
            <Text style={styles.emptyText}>No records yet today</Text>
          </View>
        ) : (
          <View style={styles.recordsList}>
            {todayRecords.map((r) => {
              const loc = locations.find((l) => l.id === r.work_location_id);
              return (
                <View key={r.id} style={styles.recordItem}>
                  <View
                    style={[
                      styles.recordIcon,
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
                  <View style={styles.recordInfo}>
                    <Text style={styles.recordType}>
                      {r.type === 'check_in' ? 'Check In' : 'Check Out'}
                    </Text>
                    <Text style={styles.recordLocation}>{loc?.name || 'Unknown'}</Text>
                  </View>
                  <Text style={styles.recordTime}>{formatTime(r.timestamp)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={{ height: theme.spacing.xl }} />
    </ScrollView>

    <Modal visible={selfieModalVisible} animationType="slide" transparent={false} onRequestClose={closeSelfieModal}>
      <View style={styles.selfieModal}>
        <View style={styles.selfieHeader}>
          <View>
            <Text style={styles.selfieTitle}>Identity selfie</Text>
            <Text style={styles.selfieSubtitle}>Take a clear photo before you record attendance.</Text>
          </View>
          <TouchableOpacity onPress={closeSelfieModal} disabled={capturingSelfie}>
            <X size={24} color={theme.neutral[600]} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View style={styles.cameraFrame}>
          {cameraPermission?.granted ? (
            <CameraView ref={cameraRef} style={styles.camera} facing="front" />
          ) : (
            <View style={styles.cameraPermissionBox}>
              <Camera size={44} color={theme.primary[600]} strokeWidth={1.8} />
              <Text style={styles.cameraPermissionTitle}>Camera access is required</Text>
              <Text style={styles.cameraPermissionText}>Allow camera access to verify the person making this attendance record.</Text>
              <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
                <Text style={styles.permissionButtonText}>Allow Camera</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.selfieInstruction}>
          <ShieldCheck size={20} color={theme.primary[600]} strokeWidth={2} />
          <Text style={styles.selfieInstructionText}>Keep your face centered, visible, and well lit.</Text>
        </View>
        {selfieError ? <Text style={styles.selfieError}>{selfieError}</Text> : null}
        <TouchableOpacity
          style={[styles.captureButton, (!cameraPermission?.granted || capturingSelfie) && styles.captureButtonDisabled]}
          onPress={captureSelfie}
          disabled={!cameraPermission?.granted || capturingSelfie}
        >
          {capturingSelfie ? <ActivityIndicator color={theme.neutral[0]} /> : <Camera size={22} color={theme.neutral[0]} strokeWidth={2} />}
          <Text style={styles.captureButtonText}>{capturingSelfie ? 'Saving...' : 'Take Selfie & Continue'}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
    </>
  );
}

function normalizeSelfieData(data: string): string {
  const firstDataUrl = data.indexOf('data:');
  const normalized = firstDataUrl >= 0 ? data.slice(firstDataUrl) : `data:image/jpeg;base64,${data}`;
  const nestedDataUrl = normalized.indexOf('data:', 5);
  return nestedDataUrl >= 0 ? normalized.slice(nestedDataUrl) : normalized;
}

async function imageUriToDataUrl(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Unable to read selfie'));
    reader.readAsDataURL(blob);
  });
}

function generateMapHtml(location: WorkLocation, userCoords: Coords | null): string {
  const lat = location.latitude;
  const lng = location.longitude;
  const radius = location.radius_meters;
  const userLat = userCoords?.latitude ?? lat;
  const userLng = userCoords?.longitude ?? lng;
  const locName = JSON.stringify(location.name);

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    body, html { margin: 0; padding: 0; height: 100%; width: 100%; }
    #map { height: 100%; width: 100%; background: #e2e8f0; }
    .loc-marker { background: #2563eb; border: 3px solid #fff; border-radius: 50%; width: 16px; height: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
    .user-marker { background: #10b981; border: 2px solid #fff; border-radius: 50%; width: 14px; height: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
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
      var userLatLng = [${userLat}, ${userLng}];

      var locIcon = L.divIcon({ className: 'loc-marker', iconSize: [16, 16], iconAnchor: [8, 8] });
      var userIcon = L.divIcon({ className: 'user-marker', iconSize: [14, 14], iconAnchor: [7, 7] });

      L.marker(locLatLng, { icon: locIcon }).addTo(map).bindPopup(${locName});
      L.circle(locLatLng, {
        radius: ${radius},
        color: '#2563eb',
        weight: 2,
        opacity: 0.6,
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
      }).addTo(map);

      if (${userLat} !== ${lat} || ${userLng} !== ${lng}) {
        L.marker(userLatLng, { icon: userIcon }).addTo(map).bindPopup('Your Location');
        map.fitBounds([locLatLng, userLatLng], { padding: [50, 50] });
      } else {
        map.setView(locLatLng, 16);
      }
    })();
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  selfieModal: {
    flex: 1,
    backgroundColor: theme.neutral[50],
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  selfieHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.neutral[200],
  },
  selfieTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: theme.fontSize.xl,
    color: theme.neutral[800],
  },
  selfieSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[500],
    marginTop: 4,
  },
  cameraFrame: {
    flex: 1,
    minHeight: 360,
    overflow: 'hidden',
    borderRadius: theme.radius.xl,
    backgroundColor: theme.neutral[900],
  },
  camera: {
    flex: 1,
  },
  cameraPermissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  cameraPermissionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.lg,
    color: theme.neutral[0],
    textAlign: 'center',
  },
  cameraPermissionText: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.sm,
    lineHeight: 21,
    color: theme.neutral[200],
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.primary[600],
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  permissionButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.md,
    color: theme.neutral[0],
  },
  selfieInstruction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.primary[50],
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  selfieInstructionText: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.sm,
    color: theme.primary[700],
  },
  selfieError: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.sm,
    color: theme.error[600],
    textAlign: 'center',
  },
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.primary[600],
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md + 2,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.md,
    color: theme.neutral[0],
  },
  container: {
    flex: 1,
    backgroundColor: theme.neutral[50],
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md + 4,
    borderWidth: 1,
    borderColor: theme.neutral[200],
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: 'Inter-Bold',
    fontSize: theme.fontSize.lg,
    color: theme.neutral[0],
  },
  userName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.md,
    color: theme.neutral[800],
  },
  userRole: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[400],
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.accent[50],
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.xs + 1,
    borderRadius: theme.radius.pill,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.xs,
    color: theme.accent[700],
  },
  section: {
    gap: theme.spacing.sm,
  },
  sectionLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  locationScroll: {
    flexDirection: 'row',
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    marginRight: theme.spacing.sm,
    borderWidth: 1.5,
    borderColor: theme.neutral[200],
  },
  locationChipActive: {
    backgroundColor: theme.primary[600],
    borderColor: theme.primary[600],
  },
  locationChipText: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[600],
    maxWidth: 120,
  },
  locationChipTextActive: {
    color: theme.neutral[0],
  },
  mapContainer: {
    height: 220,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.neutral[200],
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapOverlay: {
    position: 'absolute',
    top: theme.spacing.sm,
    left: theme.spacing.sm,
  },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.neutral[0],
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radius.pill,
    shadowColor: theme.neutral[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  gpsBadgeText: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.xs,
    color: theme.neutral[600],
  },
  timerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.primary[50],
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.primary[100],
  },
  timerCopy: {
    flex: 1,
    gap: 2,
  },
  timerLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.xs,
    color: theme.primary[700],
  },
  timerValue: {
    fontFamily: 'Inter-Bold',
    fontSize: theme.fontSize.xl,
    color: theme.primary[800],
    letterSpacing: 1,
  },
  timerLocation: {
    maxWidth: 120,
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.xs,
    color: theme.primary[700],
    textAlign: 'right',
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderWidth: 1,
    borderColor: theme.neutral[200],
  },
  gpsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  gpsInfoText: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.xs,
    color: theme.neutral[500],
    flex: 1,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.primary[50],
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.xs + 1,
    borderRadius: theme.radius.pill,
  },
  refreshBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.xs,
    color: theme.primary[600],
  },
  actionMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderWidth: 1,
  },
  actionMessageText: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  actionBtn: {
    flex: 1,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  checkInBtn: {
    backgroundColor: theme.accent[600],
  },
  checkOutBtn: {
    backgroundColor: theme.primary[600],
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.md,
    color: theme.neutral[0],
  },
  hourLimitBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.warning[50],
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.warning[100],
  },
  hourLimitText: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: theme.fontSize.xs,
    color: theme.warning[700],
  },
  emptyBox: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.neutral[200],
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[400],
  },
  recordsList: {
    gap: theme.spacing.sm,
  },
  recordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.neutral[0],
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.neutral[200],
  },
  recordIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordInfo: {
    flex: 1,
  },
  recordType: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.sm,
    color: theme.neutral[800],
  },
  recordLocation: {
    fontFamily: 'Inter-Regular',
    fontSize: theme.fontSize.xs,
    color: theme.neutral[400],
    marginTop: 2,
  },
  recordTime: {
    fontFamily: 'Inter-SemiBold',
    fontSize: theme.fontSize.md,
    color: theme.neutral[600],
  },
});

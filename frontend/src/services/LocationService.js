import { Platform } from 'react-native';

let _webIntervalId = null;
const LOCATION_TASK_NAME = 'background-location-task';

function deviceUrl(apiUrl, deviceId) {
  return `${apiUrl}/api/devices/${deviceId}/location`;
}

async function startNativeTracking(token, apiUrl, deviceId) {
  if (!deviceId) return false;
  const TaskManager = await import('expo-task-manager');
  const Location = await import('expo-location');
  const SecureStore = await import('expo-secure-store');

  await SecureStore.setItemAsync(
    'np_tracking',
    JSON.stringify({ token, apiUrl, deviceId })
  ).catch(() => {});

  if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
    TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
      if (error || !data) return;
      const location = data.locations?.[0];
      if (!location) return;
      try {
        const raw = await SecureStore.getItemAsync('np_tracking');
        if (!raw) return;
        const cfg = JSON.parse(raw);
        if (!cfg.token || !cfg.deviceId) return;
        await fetch(deviceUrl(cfg.apiUrl, cfg.deviceId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.token}` },
          body: JSON.stringify({
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          }),
        }).catch(() => {});
      } catch {}
    });
  }

  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return false;
  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg !== 'granted') return false;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15000,
    distanceInterval: 10,
    deferredUpdatesInterval: 15000,
    showsBackgroundLocationIndicator: true,
  });
  return true;
}

async function stopNativeTracking() {
  try {
    const Location = await import('expo-location');
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
  } catch {}
  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync('np_tracking').catch(() => {});
  } catch {}
}

function startWebTracking(token, apiUrl, deviceId) {
  if (!deviceId) return false;
  if (typeof navigator === 'undefined' || !navigator?.geolocation) {
    console.warn('Geolocation not available on this platform');
    return false;
  }

  if (_webIntervalId) clearInterval(_webIntervalId);

  const sendLocation = () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await fetch(deviceUrl(apiUrl, deviceId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          }).catch(() => {});
        } catch {}
      },
      () => {},
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  sendLocation();
  _webIntervalId = setInterval(sendLocation, 15000);
  return true;
}

function stopWebTracking() {
  if (_webIntervalId) {
    clearInterval(_webIntervalId);
    _webIntervalId = null;
  }
}

export async function requestLocationPermissions(token, apiUrl, deviceId) {
  if (!token || !deviceId) return false;
  if (Platform.OS === 'web') {
    return startWebTracking(token, apiUrl, deviceId);
  }
  return startNativeTracking(token, apiUrl, deviceId);
}

export function stopLocationTracking() {
  if (Platform.OS === 'web') {
    stopWebTracking();
  } else {
    stopNativeTracking();
  }
}

export function deviceStorageKey(familyId) {
  return `np_device_${familyId}`;
}

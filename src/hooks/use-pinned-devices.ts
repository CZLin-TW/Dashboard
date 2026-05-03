"use client";

// React 19 react-hooks/set-state-in-effect 規則建議用 useSyncExternalStore
// 取代「mount 後從 localStorage 還原」這個 pattern。要正確實作 snapshot
// identity stability 跟 cross-key cache map 不少 boilerplate；對單一 hook
// 不划算，整檔 disable 並在這裡集中說明 trade-off。
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from "react";

const SENSOR_KEY = "pinned-sensor";
const DEVICES_KEY = "pinned-devices";
const MAX_PINNED_DEVICES = 4;

export function usePinnedDevices() {
  const [pinnedSensor, setPinnedSensorState] = useState<string | null>(null);
  const [pinnedDevices, setPinnedDevicesState] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 從 localStorage 還原 pin 設定。SSR 不能存取 localStorage（會 hydration
  // mismatch），所以一定要在 mount 後才讀。
  useEffect(() => {
    try {
      const sensor = localStorage.getItem(SENSOR_KEY);
      const devices = localStorage.getItem(DEVICES_KEY);
      if (sensor) setPinnedSensorState(sensor);
      if (devices) setPinnedDevicesState(JSON.parse(devices));
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  const setPinnedSensor = useCallback((name: string | null) => {
    setPinnedSensorState(name);
    if (name) {
      localStorage.setItem(SENSOR_KEY, name);
    } else {
      localStorage.removeItem(SENSOR_KEY);
    }
  }, []);

  const togglePinDevice = useCallback((name: string) => {
    setPinnedDevicesState(prev => {
      let next: string[];
      if (prev.includes(name)) {
        next = prev.filter(n => n !== name);
      } else {
        if (prev.length >= MAX_PINNED_DEVICES) return prev;
        next = [...prev, name];
      }
      localStorage.setItem(DEVICES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isDevicePinned = useCallback((name: string) => {
    return pinnedDevices.includes(name);
  }, [pinnedDevices]);

  const isSensorPinned = useCallback((name: string) => {
    return pinnedSensor === name;
  }, [pinnedSensor]);

  const resetAll = useCallback(() => {
    setPinnedSensorState(null);
    setPinnedDevicesState([]);
    localStorage.removeItem(SENSOR_KEY);
    localStorage.removeItem(DEVICES_KEY);
  }, []);

  const clearAllDevices = useCallback(() => {
    setPinnedDevicesState([]);
    localStorage.removeItem(DEVICES_KEY);
  }, []);

  const canPinMore = pinnedDevices.length < MAX_PINNED_DEVICES;

  return {
    pinnedSensor,
    pinnedDevices,
    setPinnedSensor,
    togglePinDevice,
    isDevicePinned,
    isSensorPinned,
    canPinMore,
    resetAll,
    clearAllDevices,
    loaded,
    MAX_PINNED_DEVICES,
  };
}

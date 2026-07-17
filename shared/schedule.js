(function initNocturneSchedule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Nocturne = Object.assign(root.Nocturne || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function scheduleFactory() {
  'use strict';

  const DAY_MS = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const RAD = Math.PI / 180;
  const ECLIPTIC_OBLIQUITY = RAD * 23.4397;

  function minutesFromTime(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function isMinuteInRange(current, start, end) {
    if (start === end) return true;
    if (start < end) return current >= start && current < end;
    return current >= start || current < end;
  }

  function toJulian(date) {
    return date.valueOf() / DAY_MS - 0.5 + J1970;
  }

  function fromJulian(julian) {
    return new Date((julian + 0.5 - J1970) * DAY_MS);
  }

  function toDays(date) {
    return toJulian(date) - J2000;
  }

  function solarMeanAnomaly(days) {
    return RAD * (357.5291 + 0.98560028 * days);
  }

  function eclipticLongitude(anomaly) {
    const center = RAD * (
      1.9148 * Math.sin(anomaly) +
      0.02 * Math.sin(2 * anomaly) +
      0.0003 * Math.sin(3 * anomaly)
    );
    const perihelion = RAD * 102.9372;
    return anomaly + center + perihelion + Math.PI;
  }

  function declination(longitude) {
    return Math.asin(Math.sin(longitude) * Math.sin(ECLIPTIC_OBLIQUITY));
  }

  function julianCycle(days, longitudeWest) {
    return Math.round(days - 0.0009 - longitudeWest / (2 * Math.PI));
  }

  function approxTransit(hourAngleValue, longitudeWest, cycle) {
    return 0.0009 + (hourAngleValue + longitudeWest) / (2 * Math.PI) + cycle;
  }

  function solarTransitJulian(approx, anomaly, longitude) {
    return J2000 + approx + 0.0053 * Math.sin(anomaly) - 0.0069 * Math.sin(2 * longitude);
  }

  function hourAngle(altitude, latitude, solarDeclination) {
    const numerator = Math.sin(altitude) - Math.sin(latitude) * Math.sin(solarDeclination);
    const denominator = Math.cos(latitude) * Math.cos(solarDeclination);
    const ratio = numerator / denominator;
    if (ratio < -1 || ratio > 1) return null;
    return Math.acos(ratio);
  }

  function getSunTimes(date, latitude, longitude) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

    const localNoon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
    const longitudeWest = RAD * -lon;
    const latitudeRad = RAD * lat;
    const days = toDays(localNoon);
    const cycle = julianCycle(days, longitudeWest);
    const approxNoon = approxTransit(0, longitudeWest, cycle);
    const anomaly = solarMeanAnomaly(approxNoon);
    const longitudeRad = eclipticLongitude(anomaly);
    const solarDeclination = declination(longitudeRad);
    const solarNoonJulian = solarTransitJulian(approxNoon, anomaly, longitudeRad);
    const angle = hourAngle(-0.833 * RAD, latitudeRad, solarDeclination);

    if (angle === null) {
      const altitudeAtNoon = Math.asin(
        Math.sin(latitudeRad) * Math.sin(solarDeclination) +
        Math.cos(latitudeRad) * Math.cos(solarDeclination)
      );
      return {
        sunrise: null,
        sunset: null,
        solarNoon: fromJulian(solarNoonJulian),
        polarState: altitudeAtNoon > 0 ? 'day' : 'night'
      };
    }

    const sunsetApprox = approxTransit(angle, longitudeWest, cycle);
    const sunsetJulian = solarTransitJulian(sunsetApprox, anomaly, longitudeRad);
    const sunriseJulian = solarNoonJulian - (sunsetJulian - solarNoonJulian);

    return {
      sunrise: fromJulian(sunriseJulian),
      sunset: fromJulian(sunsetJulian),
      solarNoon: fromJulian(solarNoonJulian),
      polarState: null
    };
  }

  function offsetDate(date, minutes) {
    return date ? new Date(date.getTime() + Number(minutes || 0) * 60000) : null;
  }

  function isScheduleActive(schedule, date, systemDark) {
    const now = date instanceof Date ? date : new Date();
    const config = schedule || {};

    if (config.mode === 'system') return Boolean(systemDark);
    if (config.mode === 'custom') {
      const start = minutesFromTime(config.start);
      const end = minutesFromTime(config.end);
      if (start === null || end === null) return true;
      return isMinuteInRange(now.getHours() * 60 + now.getMinutes(), start, end);
    }
    if (config.mode === 'sun') {
      const sun = getSunTimes(now, config.latitude, config.longitude);
      if (!sun) return true;
      if (sun.polarState === 'night') return true;
      if (sun.polarState === 'day') return false;
      const sunrise = offsetDate(sun.sunrise, config.sunriseOffset);
      const sunset = offsetDate(sun.sunset, config.sunsetOffset);
      return now < sunrise || now >= sunset;
    }
    return true;
  }

  function dateAtMinutes(base, minutes, dayOffset) {
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (dayOffset || 0), 0, 0, 0, 0);
    date.setMinutes(minutes);
    return date;
  }

  function nextScheduleBoundary(schedule, date) {
    const now = date instanceof Date ? date : new Date();
    const config = schedule || {};

    if (config.mode === 'custom') {
      const start = minutesFromTime(config.start);
      const end = minutesFromTime(config.end);
      if (start === null || end === null || start === end) return null;
      const candidates = [];
      for (const minutes of [start, end]) {
        let candidate = dateAtMinutes(now, minutes, 0);
        if (candidate <= now) candidate = dateAtMinutes(now, minutes, 1);
        candidates.push(candidate);
      }
      return candidates.sort((a, b) => a - b)[0];
    }

    if (config.mode === 'sun') {
      const candidates = [];
      for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, 12, 0, 0, 0);
        const sun = getSunTimes(day, config.latitude, config.longitude);
        if (!sun || sun.polarState) continue;
        const sunrise = offsetDate(sun.sunrise, config.sunriseOffset);
        const sunset = offsetDate(sun.sunset, config.sunsetOffset);
        if (sunrise > now) candidates.push(sunrise);
        if (sunset > now) candidates.push(sunset);
      }
      return candidates.length ? candidates.sort((a, b) => a - b)[0] : null;
    }

    return null;
  }

  function formatLocalTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Unavailable';
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  return {
    minutesFromTime,
    isMinuteInRange,
    getSunTimes,
    isScheduleActive,
    nextScheduleBoundary,
    formatLocalTime
  };
});

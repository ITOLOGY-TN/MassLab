// Pure — Attendance tab presenter (Phase 11, data-model §3). The attendance heatmap is
// finished-session volume graded into calendar levels; this presenter is a thin wrapper
// that returns the pure `gradeByVolume` output verbatim (the AttendanceTab contract
// shape: { from, to, levels, days }). The calendar LAYOUT is a frontend concern and lives
// in the tab component, never here. No I/O, no clock, no @supabase import.
import { gradeByVolume } from '../engine/attendanceHeatmap.js';

/**
 * @param {object} args
 * @param {Array<{ ended_at: string, total_volume_kg: number }>} args.dailyVolumes
 * @param {string} args.from   YYYY-MM-DD
 * @param {string} args.to     YYYY-MM-DD
 * @param {number} args.levels number of nonzero intensity buckets
 * @returns {{ from, to, levels, days }}
 */
export function build({ dailyVolumes = [], from, to, levels }) {
  return gradeByVolume({ dailyVolumes, from, to, levels });
}

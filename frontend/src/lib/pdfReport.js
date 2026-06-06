// Phase 11 (014-phase11-statistics) US4 — client-side monthly PDF builder.
// Off the request path; the server endpoint persists nothing (FR-021). The PDF is
// assembled here with jsPDF: an off-DOM SVG weight chart is serialized → PNG via
// the browser canvas, then embedded alongside text blocks for the period, summary,
// lifetime stats, top progressions, and deterministic recommendations.
//
// Defensive by design: a cold-start report (empty weightSeries / null summary
// fields) must generate a valid PDF without throwing.
import { jsPDF } from 'jspdf';
import { linearScale, linePath } from './chartGeometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CHART_W = 480;
const CHART_H = 200;
const PAD = 24;

// Build an off-DOM SVG <svg> element for the weight series. Returns null when
// there is nothing to draw.
function buildWeightSvg(weightSeries) {
  if (!Array.isArray(weightSeries) || weightSeries.length === 0) return null;

  const values = weightSeries.map((p) => Number(p.weight_kg)).filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const sx = linearScale({
    domainMin: 0,
    domainMax: Math.max(1, values.length - 1),
    rangeMin: PAD,
    rangeMax: CHART_W - PAD,
  });
  const sy = linearScale({
    // pad the domain so a flat series still renders a centered line
    domainMin: min === max ? min - 1 : min,
    domainMax: min === max ? max + 1 : max,
    rangeMin: CHART_H - PAD,
    rangeMax: PAD,
  });
  const points = values.map((v, i) => ({ x: sx(i), y: sy(v) }));

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', String(CHART_W));
  svg.setAttribute('height', String(CHART_H));
  svg.setAttribute('viewBox', `0 0 ${CHART_W} ${CHART_H}`);

  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(CHART_W));
  bg.setAttribute('height', String(CHART_H));
  bg.setAttribute('fill', '#ffffff');
  svg.appendChild(bg);

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', linePath(points));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#2563eb');
  path.setAttribute('stroke-width', '2');
  svg.appendChild(path);

  return svg;
}

// Serialize an SVG element to a PNG data URL via an off-DOM canvas. Resolves to
// null if anything in the raster pipeline is unavailable (defensive in jsdom).
function svgToPng(svg) {
  return new Promise((resolve) => {
    try {
      const xml = new XMLSerializer().serializeToString(svg);
      const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = CHART_W;
          canvas.height = CHART_H;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, CHART_W, CHART_H);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch {
      resolve(null);
    }
  });
}

function fmt(value, suffix = '') {
  return value == null ? '—' : `${value}${suffix}`;
}

/**
 * Generate and download the monthly PDF for a report payload.
 * @param {object} report  the GET /statistics/report payload
 */
export async function generateReportPdf(report) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const period = report?.period ?? {};
  const summary = report?.summary ?? {};
  const lifetime = report?.lifetime ?? {};
  const topProgressions = report?.topProgressions ?? [];
  const recommendations = report?.recommendations ?? [];
  const margin = 40;
  let y = 56;

  doc.setFontSize(18);
  doc.text('Rapport de progression', margin, y);
  y += 24;
  doc.setFontSize(13);
  doc.text(period.label ?? period.month ?? '', margin, y);
  y += 28;

  // Embedded weight chart (skipped when there is no series).
  const svg = buildWeightSvg(report?.weightSeries);
  if (svg) {
    const png = await svgToPng(svg);
    if (png) {
      doc.addImage(png, 'PNG', margin, y, 240, 100);
      y += 116;
    }
  }

  doc.setFontSize(12);
  doc.text('Résumé du mois', margin, y);
  y += 18;
  doc.setFontSize(10);
  const summaryLines = [
    `Volume total : ${fmt(summary.volume_kg, ' kg')}`,
    `Séances réalisées : ${fmt(summary.sessions_completed)}`,
    `Variation de poids : ${fmt(summary.weight_change_kg, ' kg')}`,
    `Calories moyennes / jour : ${fmt(summary.avg_daily_calories, ' kcal')}`,
    `Sommeil moyen : ${fmt(summary.avg_sleep_hours, ' h')}`,
  ];
  for (const line of summaryLines) {
    doc.text(line, margin, y);
    y += 14;
  }
  y += 10;

  doc.setFontSize(12);
  doc.text('Depuis le début', margin, y);
  y += 18;
  doc.setFontSize(10);
  const lifetimeLines = [
    `Poids gagné : ${fmt(lifetime.total_weight_gained_kg, ' kg')}`,
    `Volume total : ${fmt(lifetime.total_volume_kg, ' kg')}`,
    `Assiduité : ${fmt(lifetime.session_completion_pct, ' %')}`,
    `Calories hebdo moyennes : ${fmt(lifetime.avg_weekly_calories, ' kcal')}`,
  ];
  for (const line of lifetimeLines) {
    doc.text(line, margin, y);
    y += 14;
  }
  y += 10;

  doc.setFontSize(12);
  doc.text('Meilleures progressions', margin, y);
  y += 18;
  doc.setFontSize(10);
  if (topProgressions.length === 0) {
    doc.text('—', margin, y);
    y += 14;
  } else {
    for (const p of topProgressions) {
      doc.text(`${p.name} : +${fmt(p.gain_kg, ' kg')}`, margin, y);
      y += 14;
    }
  }
  y += 10;

  doc.setFontSize(12);
  doc.text('Recommandations', margin, y);
  y += 18;
  doc.setFontSize(10);
  for (const rec of recommendations) {
    const wrapped = doc.splitTextToSize(`• ${rec.message}`, 515);
    doc.text(wrapped, margin, y);
    y += 14 * wrapped.length;
  }

  doc.save(`statistiques-${period.month ?? 'rapport'}.pdf`);
}

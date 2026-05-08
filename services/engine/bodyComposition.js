// Pure function — body fat % + lean body mass.
// Multi-measurement: U.S. Navy circumference formula (research.md §9).
// Fallback: Deurenberg BMI-based estimate.

function navyMale(waist_cm, neck_cm, height_cm) {
  return 86.010 * Math.log10(waist_cm - neck_cm) - 70.041 * Math.log10(height_cm) + 36.76;
}

function navyFemale(waist_cm, hip_cm, neck_cm, height_cm) {
  return 163.205 * Math.log10(waist_cm + hip_cm - neck_cm) - 97.684 * Math.log10(height_cm) - 78.387;
}

function bmiFallback(weight_kg, height_cm, age, sexFactor) {
  const bmi = weight_kg / Math.pow(height_cm / 100, 2);
  // Deurenberg: bf% = 1.20 × BMI + 0.23 × age − 10.8 × sex − 5.4
  // sexFactor: 1 male, 0 female
  return 1.2 * bmi + 0.23 * age - 10.8 * sexFactor - 5.4;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function bodyComposition({
  weight_kg,
  height_cm,
  age,
  biological_sex,
  waist_cm,
  neck_cm,
  hip_cm,
}) {
  const isMale = biological_sex === 'male';

  let method = 'bmi_fallback';
  let body_fat_pct;

  const navyEligible = isMale
    ? waist_cm != null && neck_cm != null
    : waist_cm != null && neck_cm != null && hip_cm != null;

  if (navyEligible) {
    method = 'us_navy';
    body_fat_pct = isMale
      ? navyMale(waist_cm, neck_cm, height_cm)
      : navyFemale(waist_cm, hip_cm, neck_cm, height_cm);
  } else {
    body_fat_pct = bmiFallback(weight_kg, height_cm, age, isMale ? 1 : 0);
  }

  body_fat_pct = round1(body_fat_pct);
  const lean_body_mass_kg = round1(weight_kg * (1 - body_fat_pct / 100));

  return {
    method,
    body_fat_pct,
    lean_body_mass_kg,
    inputs: { weight_kg, height_cm, age, biological_sex, waist_cm, neck_cm, hip_cm },
  };
}

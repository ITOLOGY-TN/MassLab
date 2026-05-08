// Pure function — Mifflin–St Jeor.
// CONSTITUTION v1.1.1, Principle II — no I/O, no env, no Date.now, no Supabase.

export function bmr({ weight_kg, height_cm, age, biological_sex }) {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  return Math.round(biological_sex === 'female' ? base - 161 : base + 5);
}

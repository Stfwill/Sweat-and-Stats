const KG_PER_LB = 0.45359237;
const PROFILE_KEY = "sw2_profile_metrics";

function workoutProfile() {
  return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
}

function weightUnit() {
  return workoutProfile().unit === "kg" ? "kg" : "lb";
}

function displayWeight(value) {
  if (weightUnit() === "kg" && value !== "" && value != null && Number.isFinite(Number(value))) {
    return +(Number(value) * KG_PER_LB).toFixed(2);
  }
  return value;
}

function readExerciseWeight(value, unit = weightUnit()) {
  if (unit !== "kg" || value === "" || !Number.isFinite(Number(value))) return value;
  return Number(value) / KG_PER_LB;
}

function profileName() {
  return localStorage.getItem("sw2_profile_name") || currentUser?.displayName || "";
}

function setProfileFields(unit, weightKg, heightCm) {
  $("profileWeight").value = weightKg ? +(unit === "kg" ? weightKg : weightKg / KG_PER_LB).toFixed(2) : "";
  $("profileHeightCm").value = heightCm ? +heightCm.toFixed(2) : "";
  const inches = heightCm ? +(heightCm / 2.54).toFixed(2) : 0;
  $("profileFeet").value = inches ? Math.floor(inches / 12) : "";
  $("profileInches").value = inches ? +(inches % 12).toFixed(2) : "";
  $("profileImperialHeight").classList.toggle("hidden", unit === "kg");
  $("profileMetricHeight").classList.toggle("hidden", unit !== "kg");
  $("profileWeightLabel").textContent = `Body weight (${unit})`;
}

function readProfileFields(unit) {
  return {
    weightKg: Number($("profileWeight").value) * (unit === "kg" ? 1 : KG_PER_LB),
    heightCm: unit === "kg" ? Number($("profileHeightCm").value) :
      2.54 * (Number($("profileFeet").value) * 12 + Number($("profileInches").value))
  };
}

function profileBmi(weightKg, heightCm) {
  return weightKg > 0 && heightCm > 0 ? (weightKg / (heightCm / 100) ** 2).toFixed(1) : "";
}

function renderProfileBmi() {
  const {weightKg, heightCm} = readProfileFields($("profileUnits").value);
  const bmi = profileBmi(weightKg, heightCm);
  $("profileBmi").textContent = bmi || "Add height and weight";
}

function openWorkoutProfile() {
  const profile = workoutProfile();
  const unit = weightUnit();
  $("accountName").textContent = profileName() || "Sweat & Stats User";
  $("accountEmail").textContent = currentUser?.email || "";
  $("profileDisplayName").value = profileName();
  $("profileUnits").value = unit;
  $("profileUnits").dataset.previous = unit;
  $("profileGoal").value = profile.goal || "";
  $("profileWeightDate").textContent = profile.weightDate ?
    `Weight updated ${new Date(profile.weightDate).toLocaleDateString()}` : "";
  setProfileFields(unit, profile.weightKg, profile.heightCm);
  renderProfileBmi();
  $("profileDialog").showModal();
}

function saveWorkoutProfile(event) {
  event.preventDefault();
  const old = workoutProfile();
  const unit = $("profileUnits").value;
  const {weightKg, heightCm} = readProfileFields(unit);
  const sameWeight = Math.abs((old.weightKg || 0) - weightKg) < 0.006;
  const profile = {
    unit,
    weightKg: sameWeight ? old.weightKg || 0 : weightKg,
    heightCm,
    goal: Number($("profileGoal").value),
    weightDate: weightKg ? (sameWeight && old.weightDate ? old.weightDate : new Date().toISOString()) : ""
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  localStorage.setItem("sw2_profile_name", $("profileDisplayName").value.trim());
  queueCloudSync();
  $("profileDialog").close();
  renderHome();
  renderToday();
}

function renderWeeklyGoal() {
  const goal = workoutProfile().goal;
  const week = new Date();
  week.setHours(0, 0, 0, 0);
  week.setDate(week.getDate() - (week.getDay() + 6) % 7);
  const weekEnd = new Date(week);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const count = goal ? getHistory().filter(({date}) => {
    const day = new Date(date);
    return day >= week && day < weekEnd;
  }).length : 0;
  $("homeWeeklyGoal").textContent = goal ? `${count} of ${goal} workouts this week` : "";
}

function exerciseBlock(exercise, list = exercises) {
  return exercise.pairId ? list.filter(item => item.pairId === exercise.pairId) : [exercise];
}

function blockTime(block, now) {
  const timing = block[0].timing;
  return timing ? (timing.ms || 0) + (timing.start == null ? 0 : Math.max(0, now - timing.start)) : 0;
}

function renderExerciseTiming(exercise, index) {
  if (exercise.kind === "cardio") return "";
  const block = exerciseBlock(exercise);
  const paired = block.length > 1;
  if (paired && block[0] !== exercise) {
    return `<div class="exercise-timing small">Tandem with ${escapeHistoryText(block[0].name)} · <span data-exercise-time="${index}">${fmt(blockTime(block, elapsedNow()))}</span></div>`;
  }
  const active = exercise.timing?.start != null;
  const time = blockTime(block, elapsedNow());
  const label = paired ? `Tandem · ${block.map(item => item.name).join(" + ")}` : "Exercise timer";
  return `<div class="exercise-timing">
    <div class="small"><strong>${escapeHistoryText(label)}</strong> · <span data-exercise-time="${index}">${fmt(time)}</span></div>
    <div class="actions">
      <button class="ghost" onclick="toggleExerciseTiming(${index})">${active ? (paired ? "Finish Pair" : "Finish Exercise") : time ? "Resume Timer" : paired ? "Start Pair" : "Start Exercise"}</button>
      <button class="ghost" onclick="editExerciseTiming(${index})">Edit Time</button>
      <button class="ghost" onclick="${paired ? "unpairExercises" : "openExercisePairing"}(${index})">${paired ? "Unpair" : "Pair Exercises"}</button>
    </div>
  </div>`;
}

function updateExerciseTimers() {
  document.querySelectorAll("[data-exercise-time]").forEach(element => {
    const exercise = exercises[Number(element.dataset.exerciseTime)];
    if (exercise) element.textContent = fmt(blockTime(exerciseBlock(exercise), elapsedNow()));
  });
}

function setBlockTiming(block, timing) {
  for (const exercise of block) exercise.timing = timing;
}

function stopExerciseTimers() {
  const now = elapsedNow();
  for (const exercise of exercises) {
    if (exercise.timing?.start != null) {
      setBlockTiming(exerciseBlock(exercise), {ms:blockTime([exercise], now)});
    }
  }
  persist();
}

function toggleExerciseTiming(index) {
  const block = exerciseBlock(exercises[index]);
  const wasRunning = block[0].timing?.start != null;
  stopExerciseTimers();
  if (!wasRunning) {
    startTimer();
    setBlockTiming(block, {ms:blockTime(block, elapsedNow()), start:elapsedNow()});
  }
  persist();
  renderToday();
}

function editExerciseTiming(index) {
  const block = exerciseBlock(exercises[index]);
  const current = Math.round(blockTime(block, elapsedNow()) / 1000);
  const input = prompt("Enter total time in seconds, including rest. Enter 0 to clear the time.", current);
  if (input === null) return;
  const seconds = Number(input);
  if (!input.trim() || !Number.isSafeInteger(seconds) || seconds < 0 || seconds > 86400) {
    return alert("Enter a whole number from 0 to 86,400 seconds.");
  }
  setBlockTiming(block, {ms:seconds * 1000});
  persist();
  renderToday();
  if ($("finishWorkoutDialog").open) renderFinishCalories();
}

function openExercisePairing(index) {
  const options = $("pairPartner");
  options.replaceChildren(new Option("Choose an exercise", ""));
  exercises.forEach((item, other) => {
    if (other !== index && item.kind !== "cardio" && !item.pairId) {
      options.add(new Option(item.name, other));
    }
  });
  if (options.options.length < 2) return alert("Add another unpaired strength exercise first.");
  $("pairForm").dataset.index = index;
  $("pairDialog").showModal();
}

function saveExercisePair(event) {
  event.preventDefault();
  const first = exercises[Number(event.currentTarget.dataset.index)];
  const second = exercises[Number($("pairPartner").value)];
  if (!first || !second || first === second || first.pairId || second.pairId) return;
  if ([first, second].some(ex => ex.timing?.start != null || ex.timing?.ms) &&
      !confirm("Pairing clears both individual times. Continue?")) return;
  exercises.splice(exercises.indexOf(second), 1);
  exercises.splice(exercises.indexOf(first) + 1, 0, second);
  first.pairId = second.pairId = crypto.randomUUID();
  setBlockTiming([first, second], null);
  $("pairDialog").close();
  persist();
  renderToday();
}

function unpairExercises(index, removing = false) {
  const block = exerciseBlock(exercises[index]);
  if (block.length < 2) return true;
  if (block[0].timing && !confirm("Separating this pair clears its shared time. Continue?")) return false;
  for (const exercise of block) {
    delete exercise.pairId;
    delete exercise.timing;
  }
  if (!removing) {
    persist();
    renderToday();
  }
  return true;
}

function activeCalories(minutes, kg, met) {
  return minutes * kg * 0.0175 * (met - 1);
}

function activityMet(exercise) {
  if (exercise.kind === "cardio") {
    if (/stair|stepmill/i.test(exercise.name)) return 9.3;
    if (/elliptical/i.test(exercise.name)) return 5;
    if (/walk/i.test(exercise.name)) return 3.8;
    return 5;
  }
  return 3.5;
}

function estimateWorkoutCalories(completed, duration, kg, now = duration) {
  const blocks = [];
  const pairs = new Set();
  let untimedStrength = false;
  for (const exercise of completed) {
    if (exercise.kind === "cardio") {
      const minutes = Number(exercise.minutes);
      if (minutes > 0) blocks.push({label:exercise.name, minutes, met:activityMet(exercise)});
      continue;
    }
    if (exercise.pairId && pairs.has(exercise.pairId)) continue;
    if (exercise.pairId) pairs.add(exercise.pairId);
    const block = exerciseBlock(exercise, completed);
    const minutes = blockTime(block, now) / 60000;
    if (!minutes) {
      untimedStrength = true;
      continue;
    }
    // The timer includes shared rests. Use the general strength-training rate for a pair.
    blocks.push({
      label:block.map(item => item.name).join(" + "),
      minutes,
      met:block.length > 1 ? 3.5 : activityMet(exercise)
    });
  }
  const timed = blocks.reduce((sum, block) => sum + block.minutes, 0);
  const remaining = Math.max(0, duration / 60000 - timed);
  if (untimedStrength && remaining) blocks.push({label:"Strength training", minutes:remaining, met:3.5});
  const breakdown = blocks.map(({label, minutes, met}) => ({
    label, minutes, kcal:kg > 0 ? Math.round(activeCalories(minutes, kg, met)) : null
  }));
  return {
    source:kg > 0 && breakdown.length ? "Estimated" : "",
    kcal:kg > 0 && breakdown.length ?
      Math.round(blocks.reduce((sum, {minutes, met}) => sum + activeCalories(minutes, kg, met), 0)) : null,
    weightKg:kg || null,
    breakdown
  };
}

function finishCalories() {
  const {completed, duration} = workoutTotals();
  const estimate = estimateWorkoutCalories(completed, duration, workoutProfile().weightKg);
  const watch = $("finishWatchCalories").value;
  return watch !== "" && $("finishWatchCalories").validity.valid ?
    {...estimate, kcal:Number(watch), source:"Watch"} : estimate;
}

function calorieSummary(calories) {
  return calories?.kcal == null ? "" : `${calories.kcal} active cal (${calories.source})`;
}

function calorieBreakdownHtml(calories) {
  if (!calories?.breakdown?.length) return "";
  return `<details><summary>${["Watch", "Manual"].includes(calories.source) ? "Estimated breakdown" : "Calorie Breakdown"}</summary>
    ${calories.breakdown.map(row => `<div class="calorie-row"><span>${escapeHistoryText(row.label)}</span><span>${Number(row.minutes.toFixed(2))} min${row.kcal == null ? "" : ` · ~${row.kcal} cal`}</span></div>`).join("")}
    ${calories.weightKg ? `<div class="small muted">Estimate used ${displayWeight(+(calories.weightKg / KG_PER_LB).toFixed(2))} ${weightUnit()} body weight.</div>` : ""}
    </details>`;
}

function renderFinishCalories() {
  const calories = finishCalories();
  $("finishCalorieResult").textContent = calorieSummary(calories) ||
    (workoutProfile().weightKg ? "Add exercise time to estimate calories." : "Add body weight in My Profile to estimate calories.");
  $("finishCalorieBreakdown").innerHTML = calorieBreakdownHtml(calories);
}

function initWorkoutMetrics() {
  $("homeGreeting").onclick = openWorkoutProfile;
  $("profileBtn").onclick = openWorkoutProfile;
  $("profileForm").onsubmit = saveWorkoutProfile;
  $("profileForm").oninput = renderProfileBmi;
  $("profileUnits").onchange = event => {
    const select = event.target;
    const {weightKg, heightCm} = readProfileFields(select.dataset.previous);
    setProfileFields(select.value, weightKg, heightCm);
    select.dataset.previous = select.value;
    renderProfileBmi();
  };
  $("pairForm").onsubmit = saveExercisePair;
  $("finishWatchCalories").oninput = renderFinishCalories;
}

function renderFinishTimingEdits() {
  const shownPairs = new Set();
  const rows = exercises.map((exercise, index) => {
    if (!exercise.done || exercise.kind === "cardio") return "";
    if (exercise.pairId && shownPairs.has(exercise.pairId)) return "";
    if (exercise.pairId) shownPairs.add(exercise.pairId);
    const label = exerciseBlock(exercise).map(item => item.name).join(" + ");
    return `<div class="calorie-row"><span>${escapeHistoryText(label)}</span><button class="ghost" onclick="editExerciseTiming(${index})">Edit Time</button></div>`;
  }).join("");
  $("finishTimingEdits").innerHTML = rows ? `<details><summary>Edit exercise times</summary>${rows}</details>` : "";
}

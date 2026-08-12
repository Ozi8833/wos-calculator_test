/* ==========================================================================
   Whiteout Survival Insertion Calculator & Multi-March Tracker (v10.0 Logic)
   ========================================================================== */

// --- Global Application State (v1.00.13) ---
const state = {
  timezone: 'UTC', // 'UTC' or 'LOCAL'
  syncOffsetMs: 0,
  mode: 'live', // 'live' or 'snapshot'
  audioUnlocked: false,
  audioCtx: null,
  marchList: [],
  history: [],
  enemyPresets: [],
  selectedGapIndex: 0,
  selectedGapKey: null,
  strategyNote: '',
  lastDeletedPreset: null,
  settings: {
    skipSplash: false,
    stickyHeader: true,
    showResultMetrics: true,
    customBg: '',
    themeBg: '#080c14',
    themeAccent: '#00f0ff',
    themeText: '#e6f1ff'
  },
  calc: {
    mode: 'normal',
    expression: '',
    tokens: []
  }
};

// --- Enemy Preset LocalStorage Helpers ---
function saveEnemyPreset(tag, name, marchSec) {
  if (!tag && !name) return;
  const key = `${tag.trim()}:${name.trim()}`;
  const existing = state.enemyPresets.find(p => p.key === key);
  if (!existing) {
    state.enemyPresets.unshift({ key, tag: tag.trim(), name: name.trim(), marchSec });
    if (state.enemyPresets.length > 20) state.enemyPresets.pop();
  } else {
    existing.marchSec = marchSec;
  }
  localStorage.setItem('wos_enemy_presets', JSON.stringify(state.enemyPresets));
}

function deleteSelectedPreset(marchId) {
  const cardElem = document.querySelector(`.march-card[data-id="${marchId}"]`);
  if (!cardElem) return;
  const selectElem = cardElem.querySelector('select');
  if (!selectElem || selectElem.value === '') {
    alert('削除するプリセットをドロップダウンから選択してください。');
    return;
  }
  const idx = parseInt(selectElem.value, 10);
  const deletedItem = state.enemyPresets.splice(idx, 1)[0];
  if (deletedItem) {
    state.lastDeletedPreset = deletedItem;
    state.marchList.forEach(m => {
      if (m.selectedPresetIndex === idx) delete m.selectedPresetIndex;
    });
    localStorage.setItem('wos_enemy_presets', JSON.stringify(state.enemyPresets));
    renderMarchCards();
    calculateInsertion();
    alert(`プリセット [${deletedItem.tag || ''}] ${deletedItem.name || ''} を削除しました！「↩️ 復元」ボタンで戻せます。`);
  }
}

function undoDeletePreset() {
  if (!state.lastDeletedPreset) {
    alert('復元できる直前の削除データはありません。');
    return;
  }
  const restored = state.lastDeletedPreset;
  state.enemyPresets.unshift(restored);
  state.lastDeletedPreset = null;
  localStorage.setItem('wos_enemy_presets', JSON.stringify(state.enemyPresets));
  renderMarchCards();
  calculateInsertion();
  alert(`プリセット [${restored.tag || ''}] ${restored.name || ''} を復元しました！`);
}

// --- Custom Preset Picker Modal Controller ---
let currentTargetMarchIdForPreset = null;
let presetSortMode = 'recent'; // 'recent' | 'tag' | 'name'

function setPresetSortMode(mode) {
  presetSortMode = mode;

  // Update sort button active states
  const btnRecent = document.getElementById('preset-sort-recent');
  const btnTag = document.getElementById('preset-sort-tag');
  const btnName = document.getElementById('preset-sort-name');

  if (btnRecent) btnRecent.className = `btn-game btn-xs ${mode === 'recent' ? 'btn-primary active' : 'btn-secondary'} preset-sort-btn`;
  if (btnTag) btnTag.className = `btn-game btn-xs ${mode === 'tag' ? 'btn-primary active' : 'btn-secondary'} preset-sort-btn`;
  if (btnName) btnName.className = `btn-game btn-xs ${mode === 'name' ? 'btn-primary active' : 'btn-secondary'} preset-sort-btn`;

  renderPresetPickerList();
}

function openPresetPickerModal(marchId) {
  currentTargetMarchIdForPreset = marchId;
  const modal = document.getElementById('preset-picker-modal');
  const listElem = document.getElementById('preset-picker-list');
  if (!modal || !listElem) return;

  renderPresetPickerList();
  modal.classList.add('open');
}

function closePresetPickerModal() {
  const modal = document.getElementById('preset-picker-modal');
  if (modal) modal.classList.remove('open');
}

function renderPresetPickerList() {
  const listElem = document.getElementById('preset-picker-list');
  if (!listElem) return;
  listElem.innerHTML = '';

  if (state.enemyPresets.length === 0) {
    listElem.innerHTML = `
      <div class="text-center text-gray-400 py-8 text-sm">
        保存済みの敵プリセットはありません。<br>
        「同盟タグ」「領主名」を入力後、<span class="text-amber-400 font-bold">「💾 保存」</span> ボタンを押すと登録されます。
      </div>
    `;
    return;
  }

  // Create indexed copy for sorting while retaining original array index for deletion
  let indexedPresets = state.enemyPresets.map((p, originalIdx) => ({ preset: p, originalIdx }));

  if (presetSortMode === 'tag') {
    indexedPresets.sort((a, b) => {
      const tagA = (a.preset.tag || '').toUpperCase();
      const tagB = (b.preset.tag || '').toUpperCase();
      return tagA.localeCompare(tagB, 'ja');
    });
  } else if (presetSortMode === 'name') {
    indexedPresets.sort((a, b) => {
      const nameA = (a.preset.name || '').toUpperCase();
      const nameB = (b.preset.name || '').toUpperCase();
      return nameA.localeCompare(nameB, 'ja');
    });
  }

  indexedPresets.forEach(({ preset: p, originalIdx }) => {
    const item = document.createElement('div');
    item.className = 'preset-item-card';
    item.innerHTML = `
      <div class="flex-1 cursor-pointer" onclick="selectPresetFromModal(${originalIdx})">
        <div class="font-bold text-cyan-300 text-sm flex items-center gap-2">
          ${p.tag ? `<span class="bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded text-xs font-mono">[${p.tag}]</span>` : ''}
          <span>${p.name || '領主名なし'}</span>
        </div>
        <div class="text-xs text-gray-400 font-mono mt-0.5">
          行軍時間: <span class="text-yellow-300 font-bold">${formatCountdownMMSSs(p.marchSec)}</span>
        </div>
      </div>
      <button class="preset-delete-btn" onclick="deletePresetFromModal(event, ${originalIdx})" title="このプリセットを削除">
        <i class="fa-solid fa-trash-can text-lg"></i>
      </button>
    `;
    listElem.appendChild(item);
  });
}

function selectPresetFromModal(presetIdx) {
  const p = state.enemyPresets[presetIdx];
  if (!p) return;

  const march = state.marchList.find(m => m.id === currentTargetMarchIdForPreset);
  if (march) {
    march.allianceTag = p.tag;
    march.governorName = p.name;
    march.marchTimeSec = p.marchSec;
    renderMarchCards();
    calculateInsertion();
  }
  closePresetPickerModal();
}

function deletePresetFromModal(event, presetIdx) {
  event.stopPropagation();
  const deletedItem = state.enemyPresets.splice(presetIdx, 1)[0];
  if (deletedItem) {
    state.lastDeletedPreset = deletedItem;
    localStorage.setItem('wos_enemy_presets', JSON.stringify(state.enemyPresets));
    renderPresetPickerList();
    renderMarchCards();
    calculateInsertion();
  }
}

function loadEnemyPresets() {
  const saved = localStorage.getItem('wos_enemy_presets');
  if (saved) {
    try { state.enemyPresets = JSON.parse(saved); } catch (e) {}
  }
  const savedNote = localStorage.getItem('wos_strategy_note');
  if (savedNote) state.strategyNote = savedNote;
}

// --- Dynamic March Management (v1.00.13 with Preset Buttons & Big Controls) ---
let marchIdCounter = 1;

function createMarchCardData(tag = '', name = '', marchSec = 90) {
  const id = marchIdCounter++;
  return {
    id: id,
    allianceTag: tag,
    governorName: name,
    rallyTimeSec: 300, // default 5m
    marchTimeSec: marchSec,
    isRunning: false,
    remainingRallySec: 300,
    hasBeenStarted: false
  };
}

function renderMarchCards() {
  const container = document.getElementById('march-list-container');
  container.innerHTML = '';

  state.marchList.forEach((march, index) => {
    const card = document.createElement('div');
    card.className = 'glass-card march-card';
    card.dataset.id = march.id;

    const isRunning = march.isRunning;

    // Preset dropdown options
    let presetOptionsHtml = '<option value="">-- 💾 プリセット呼出 --</option>';
    state.enemyPresets.forEach((p, pIdx) => {
      const isSelected = march.selectedPresetIndex === pIdx;
      presetOptionsHtml += `<option value="${pIdx}" ${isSelected ? 'selected' : ''}>[${p.tag}] ${p.name} (${formatCountdownMMSSs(p.marchSec)})</option>`;
    });

    const hideAdjust = state.settings.hideAdjustButtons || false;

    card.innerHTML = `
      <div class="march-header">
        <div class="march-title">
          <i class="fa-solid fa-crosshairs"></i> 相手 ${index + 1}
        </div>
        <div class="flex items-center gap-2">
          <!-- Adjust Buttons Toggle Button -->
          <button class="btn-game btn-xs btn-secondary flex items-center gap-1" onclick="toggleCardAdjustButtons()" title="調整ボタンの表示/非表示">
            <i class="fa-solid ${hideAdjust ? 'fa-sliders' : 'fa-sliders text-cyan-400'}"></i> ${hideAdjust ? '調整表示' : '調整隠す'}
          </button>
          <!-- Individual Start Button (no pause) -->
          ${march.isRunning ? `
            <span class="btn-game btn-xs btn-secondary" style="opacity:0.6;cursor:default;">
              <i class="fa-solid fa-circle-play mr-1"></i> 稼働中
            </span>
          ` : `
            <button class="btn-game btn-xs btn-primary" onclick="startMarchTimer(${march.id})">
              <i class="fa-solid fa-play mr-1"></i> スタート
            </button>
          `}
          ${state.marchList.length > 2 ? `
            <button class="btn-game btn-xs btn-danger" onclick="removeMarchCard(${march.id})">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Quick Preset Selector Bar -->
      <div class="flex gap-1.5 mb-2">
        <button class="btn-game btn-xs btn-primary flex-1 justify-between px-3" style="min-height:36px;" onclick="openPresetPickerModal(${march.id})" title="敵プリセットを選択・管理">
          <span><i class="fa-solid fa-folder-open mr-1 text-yellow-300"></i> プリセット呼出 / 削除 (${state.enemyPresets.length}件)</span>
          <i class="fa-solid fa-chevron-down text-xs opacity-70"></i>
        </button>
        <button class="btn-game btn-xs btn-accent" style="min-height:36px;" onclick="saveCurrentMarchAsPreset(${march.id})" title="この編成を保存">
          <i class="fa-solid fa-floppy-disk mr-1"></i> 保存
        </button>
        ${state.lastDeletedPreset ? `
          <button class="btn-game btn-xs btn-secondary" style="min-height:36px;" onclick="undoDeletePreset()" title="直前に削除したデータを復元">
            <i class="fa-solid fa-rotate-left mr-1"></i> 復元
          </button>
        ` : ''}
      </div>

      <div class="form-grid">
        <div class="input-group">
          <label>同盟タグ</label>
          <input type="text" class="game-input alliance-input text-transform-uppercase" 
                 value="${march.allianceTag}" placeholder="ABC" 
                 oninput="this.value = this.value.toUpperCase(); updateMarchData(${march.id}, 'allianceTag', this.value)">
        </div>
        <div class="input-group">
          <label>領主名</label>
          <input type="text" class="game-input gov-input" 
                 value="${march.governorName}" placeholder="PlayerName"
                 oninput="updateMarchData(${march.id}, 'governorName', this.value)">
        </div>
      </div>

      <div class="time-input-row">
        <div class="input-group">
          <label>集結残り時間 (MM:SS)</label>
          <input type="text" class="game-input text-digital rally-input" 
                 value="${formatCountdownMMSSs(march.remainingRallySec)}" 
                 onchange="onRallyInputChange(${march.id}, this.value)">
        </div>
        <div class="input-group">
          <label>行軍時間 (MM:SS)</label>
          <input type="text" class="game-input text-digital march-input" 
                 value="${formatCountdownMMSSs(march.marchTimeSec)}" 
                 onchange="onMarchInputChange(${march.id}, this.value)">
        </div>
      </div>

      <div class="time-input-row">
        <div class="input-group">
          <label class="text-cyan-300 font-bold"><i class="fa-solid fa-bullseye"></i> 着弾時刻 (HH:MM:SS.s)</label>
          <input type="text" class="game-input text-digital land-time-input border-cyan-500/50" 
                 placeholder="例: 19:05:30.0"
                 value="${getProjectedLandTimeStr(march)}" 
                 onchange="onLandTimeInputChange(${march.id}, this.value)">
        </div>
      </div>

      <!-- Collapsible Adjust Buttons Section -->
      <div class="card-adjust-buttons-container ${hideAdjust ? 'hidden' : ''}">
        <!-- Direct Sync Minutes / Seconds Buttons -->
        <div class="text-xs font-extrabold text-cyan-400 mt-2 mb-1">🎯 ゲーム時刻 ダイレクト同期</div>
        <div class="grid grid-cols-6 gap-1 mb-1.5">
          <button class="btn-game btn-xs btn-primary font-bold" onclick="setMarchRallyMinute(${march.id}, 5)">5分</button>
          <button class="btn-game btn-xs btn-primary font-bold" onclick="setMarchRallyMinute(${march.id}, 4)">4分</button>
          <button class="btn-game btn-xs btn-primary font-bold" onclick="setMarchRallyMinute(${march.id}, 3)">3分</button>
          <button class="btn-game btn-xs btn-primary font-bold" onclick="setMarchRallyMinute(${march.id}, 2)">2分</button>
          <button class="btn-game btn-xs btn-primary font-bold" onclick="setMarchRallyMinute(${march.id}, 1)">1分</button>
          <button class="btn-game btn-xs btn-primary font-bold" onclick="setMarchRallyMinute(${march.id}, 0)">0分</button>
        </div>
        <div class="grid grid-cols-6 gap-1 mb-2">
          <button class="btn-game btn-xs btn-accent font-bold" onclick="setMarchRallySecond(${march.id}, 50)">50s</button>
          <button class="btn-game btn-xs btn-accent font-bold" onclick="setMarchRallySecond(${march.id}, 40)">40s</button>
          <button class="btn-game btn-xs btn-accent font-bold" onclick="setMarchRallySecond(${march.id}, 30)">30s</button>
          <button class="btn-game btn-xs btn-accent font-bold" onclick="setMarchRallySecond(${march.id}, 20)">20s</button>
          <button class="btn-game btn-xs btn-accent font-bold" onclick="setMarchRallySecond(${march.id}, 10)">10s</button>
          <button class="btn-game btn-xs btn-accent font-bold" onclick="setMarchRallySecond(${march.id}, 0)">0s</button>
        </div>

        <!-- Fine Millisecond Tuning Buttons (±1.0s / ±0.1s only) -->
        <div class="text-xs font-bold text-gray-400 mb-1">⏱ 秒 / コンマ秒 加算・減算</div>
        <div class="card-fine-tune">
          <button class="btn-game btn-xs btn-secondary font-bold" onclick="adjustMarchTimer(${march.id}, -1.0)">◀ 1.0s</button>
          <button class="btn-game btn-xs btn-secondary font-bold" onclick="adjustMarchTimer(${march.id}, -0.1)">◀ 0.1s</button>
          <button class="btn-game btn-xs btn-secondary font-bold" onclick="adjustMarchTimer(${march.id}, 0.1)">0.1s ▶</button>
          <button class="btn-game btn-xs btn-secondary font-bold" onclick="adjustMarchTimer(${march.id}, 1.0)">1.0s ▶</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  const countBadge = document.getElementById('march-count-badge');
  if (countBadge) {
    countBadge.textContent = state.marchList.length;
  }

  attachFocusAutoEndCursor();
}

function getProjectedLandDate(march) {
  if (march.targetLandDate) {
    return march.targetLandDate;
  }
  if (march.startTimestamp && march.initialRallySec !== undefined) {
    return new Date(march.startTimestamp + (march.initialRallySec + march.marchTimeSec) * 1000);
  }
  if (march.isRunning) {
    const refNow = getAdjustedNowTime();
    return new Date(refNow.getTime() + (march.remainingRallySec + march.marchTimeSec) * 1000);
  }
  if (!march.frozenLandDate) {
    const refNow = getAdjustedNowTime();
    march.frozenLandDate = new Date(refNow.getTime() + (march.remainingRallySec + march.marchTimeSec) * 1000);
  }
  return march.frozenLandDate;
}

function getProjectedLandTimeStr(march) {
  return formatTimeHHMMSSs(getProjectedLandDate(march));
}

function onLandTimeInputChange(marchId, valStr) {
  const march = state.marchList.find(m => m.id === marchId);
  if (!march || !valStr || !valStr.trim()) return;

  const rawStr = valStr.trim();
  const now = getAdjustedNowTime();
  const isUTC = state.timezone === 'UTC';
  let targetH = isUTC ? now.getUTCHours() : now.getHours();
  let targetM = isUTC ? now.getUTCMinutes() : now.getMinutes();
  let targetS = 0;
  let hasParsed = false;

  const parts = rawStr.split(':');
  if (parts.length === 3) {
    targetH = parseInt(parts[0], 10) || 0;
    targetM = parseInt(parts[1], 10) || 0;
    targetS = parseFloat(parts[2]) || 0;
    hasParsed = true;
  } else if (parts.length === 2) {
    targetM = parseInt(parts[0], 10) || 0;
    targetS = parseFloat(parts[1]) || 0;
    hasParsed = true;
  }

  if (hasParsed) {
    const targetLandDate = new Date(now);
    let secWhole = Math.floor(targetS);
    let secMs = Math.round((targetS - secWhole) * 1000);

    if (isUTC) {
      targetLandDate.setUTCHours(targetH, targetM, secWhole, secMs);
    } else {
      targetLandDate.setHours(targetH, targetM, secWhole, secMs);
    }

    if (targetLandDate.getTime() < now.getTime() - 60000) {
      if (isUTC) {
        targetLandDate.setUTCDate(targetLandDate.getUTCDate() + 1);
      } else {
        targetLandDate.setDate(targetLandDate.getDate() + 1);
      }
    }

    march.targetLandDate = targetLandDate;
    delete march.frozenLandDate;
    delete march.startTimestamp;
    delete march.initialRallySec;
    march.hasBeenStarted = false;

    const totalNeededSec = (targetLandDate.getTime() - now.getTime()) / 1000;
    const rallySecNeeded = Math.max(0, totalNeededSec - march.marchTimeSec);
    march.remainingRallySec = rallySecNeeded;

    renderMarchCards();
    calculateInsertion();
  }
}

function startMarchTimer(id, skipRender = false) {
  initAudio();
  const march = state.marchList.find(m => m.id === id);
  if (march && !march.isRunning) {
    const now = getAdjustedNowTime();
    if (march.targetLandDate) {
      // If targetLandDate is locked, recalculate remainingRallySec at exact start time
      const totalNeededSec = (march.targetLandDate.getTime() - now.getTime()) / 1000;
      march.remainingRallySec = Math.max(0, totalNeededSec - march.marchTimeSec);
    } else {
      // Clear frozenLandDate so getProjectedLandDate computes live dynamically while running
      delete march.frozenLandDate;
    }
    march.isRunning = true;
    march.hasBeenStarted = true;
    march.startTimestamp = now.getTime();
    march.initialRallySec = march.remainingRallySec;
    delete march.marchRemainingToLand;
    if (!skipRender) {
      renderMarchCards();
      calculateInsertion();
    }
  }
}

function saveMyMarchTime(valStr) {
  localStorage.setItem('wos_my_march_time', valStr);
}

function loadMyMarchTime() {
  const saved = localStorage.getItem('wos_my_march_time');
  if (saved) {
    const myInput = document.getElementById('my-march-time');
    if (myInput) {
      myInput.value = saved;
    }
  }
}

function addMarchCard(tag = '', name = '') {
  state.marchList.push(createMarchCardData(tag, name));
  renderMarchCards();
  calculateInsertion();
}

function removeMarchCard(id) {
  if (state.marchList.length <= 2) return;
  state.marchList = state.marchList.filter(m => m.id !== id);
  delete state.selectedGapKey;
  state.selectedGapIndex = 0;
  renderMarchCards();
  calculateInsertion();
}

function applyEnemyPresetToMarch(marchId, presetIndex) {
  if (presetIndex === '') return;
  const idx = parseInt(presetIndex, 10);
  const p = state.enemyPresets[idx];
  if (!p) return;
  const march = state.marchList.find(m => m.id === marchId);
  if (march) {
    march.allianceTag = p.tag;
    march.governorName = p.name;
    march.marchTimeSec = p.marchSec;
    march.selectedPresetIndex = idx;
    renderMarchCards();
    calculateInsertion();
  }
}

function saveCurrentMarchAsPreset(marchId) {
  const march = state.marchList.find(m => m.id === marchId);
  if (!march) return;

  const cardElem = document.querySelector(`.march-card[data-id="${marchId}"]`);
  let tag = march.allianceTag;
  let name = march.governorName;

  if (cardElem) {
    const tagInput = cardElem.querySelector('.alliance-input');
    const nameInput = cardElem.querySelector('.gov-input');
    if (tagInput && tagInput.value) tag = tagInput.value.trim().toUpperCase();
    if (nameInput && nameInput.value) name = nameInput.value.trim();
  }

  if (tag || name) {
    march.allianceTag = tag;
    march.governorName = name;
    saveEnemyPreset(tag, name, march.marchTimeSec);
    renderMarchCards();
    calculateInsertion();
    alert(`敵プリセット [${tag || ''}] ${name || ''} を正常に保存しました！`);
  } else {
    alert('保存するには同盟タグまたは領主名を入力してください。');
  }
}

function clearAllMarches() {
  if (confirm('追加されている相手行軍を初期状態（相手1・相手2）に一括リセットしますか？')) {
    state.marchList = [
      createMarchCardData('', ''),
      createMarchCardData('', '')
    ];
    state.selectedGapIndex = 0;
    renderMarchCards();
    calculateInsertion();
  }
}

// --- Web Audio API Alert Beep Generator ---
function initAudio() {
  if (!state.audioCtx) {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxClass) {
      state.audioCtx = new AudioCtxClass();
    }
  }
  if (state.audioCtx && state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
  }
  state.audioUnlocked = true;
}

function playBeep(freq = 880, type = 'sine', duration = 0.15) {
  if (!state.audioCtx || !state.audioUnlocked) return;
  try {
    const osc = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, state.audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, state.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, state.audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(state.audioCtx.destination);
    osc.start();
    osc.stop(state.audioCtx.currentTime + duration);
  } catch (e) {
    console.error('Audio play error', e);
  }
}

// --- Time Utilities (0.1s Precision) ---
function getAdjustedNowTime() {
  return new Date(Date.now() + state.syncOffsetMs);
}

function formatTimeHHMMSSs(dateObj) {
  let d = dateObj || getAdjustedNowTime();
  let hours = state.timezone === 'UTC' ? d.getUTCHours() : d.getHours();
  let minutes = state.timezone === 'UTC' ? d.getUTCMinutes() : d.getMinutes();
  let seconds = state.timezone === 'UTC' ? d.getUTCSeconds() : d.getSeconds();
  let ms = state.timezone === 'UTC' ? d.getUTCMilliseconds() : d.getMilliseconds();
  let sFraction = Math.floor(ms / 100);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${sFraction}`;
}

function parseSecondsFromMMSS(str) {
  if (!str) return 0;
  let sStr = String(str).trim();
  let parts = sStr.split(':');
  let totalSec = 0;
  if (parts.length >= 2) {
    let m = parseFloat(parts[0]) || 0;
    let s = parseFloat(parts[1]) || 0;
    totalSec = m * 60 + s;
  } else {
    totalSec = parseFloat(sStr) || 0;
  }
  return isNaN(totalSec) ? 0 : Math.round(totalSec * 10) / 10;
}

function parseSecondsFromHHMMSS(str) {
  if (!str) return 0;
  let parts = str.trim().split(':');
  if (parts.length === 3) {
    let h = parseFloat(parts[0]) || 0;
    let m = parseFloat(parts[1]) || 0;
    let s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    let m = parseFloat(parts[0]) || 0;
    let s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  return parseFloat(str) || 0;
}

function formatCountdownMMSS(totalSec) {
  totalSec = Math.round(totalSec * 10) / 10;
  if (totalSec < 0) totalSec = 0;
  let m = Math.floor(totalSec / 60);
  let s = Math.floor(totalSec % 60);
  if (s >= 60) {
    m += 1;
    s = 0;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTimeHHMMSS(dateObj) {
  let d = dateObj || getAdjustedNowTime();
  let hours = state.timezone === 'UTC' ? d.getUTCHours() : d.getHours();
  let minutes = state.timezone === 'UTC' ? d.getUTCMinutes() : d.getMinutes();
  let seconds = state.timezone === 'UTC' ? d.getUTCSeconds() : d.getSeconds();

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatCountdownMMSSs(totalSec) {
  totalSec = Math.round(totalSec * 10) / 10;
  if (totalSec < 0) totalSec = 0;
  let m = Math.floor(totalSec / 60);
  let s = Math.floor(totalSec % 60);
  let frac = Math.round((totalSec % 1) * 10);
  if (frac >= 10) {
    s += 1;
    frac = 0;
  }
  if (s >= 60) {
    m += 1;
    s = 0;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${frac}`;
}

// --- Cursor Auto-Move to End on Focus ---
function attachFocusAutoEndCursor() {
  document.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
    input.addEventListener('focus', (e) => {
      let val = e.target.value;
      setTimeout(() => {
        if (typeof e.target.setSelectionRange === 'function') {
          e.target.setSelectionRange(val.length, val.length);
        }
      }, 0);
    });
  });
}

function onRallyInputChange(id, valStr) {
  const item = state.marchList.find(m => m.id === id);
  if (item) {
    delete item.targetLandDate;
    delete item.frozenLandDate;
    delete item.startTimestamp;
    delete item.initialRallySec;
    item.hasBeenStarted = false;
    item.remainingRallySec = parseSecondsFromMMSS(valStr);
    renderMarchCards();
    calculateInsertion();
  }
}

function onMarchInputChange(id, valStr) {
  const item = state.marchList.find(m => m.id === id);
  if (item) {
    delete item.targetLandDate;
    delete item.frozenLandDate;
    delete item.startTimestamp;
    delete item.initialRallySec;
    item.hasBeenStarted = false;
    item.marchTimeSec = parseSecondsFromMMSS(valStr);
    renderMarchCards();
    calculateInsertion();
  }
}

function adjustMarchTimer(id, deltaSec) {
  const item = state.marchList.find(m => m.id === id);
  if (item) {
    delete item.targetLandDate;
    delete item.frozenLandDate;
    delete item.startTimestamp;
    delete item.initialRallySec;
    item.hasBeenStarted = false;
    const nextVal = item.remainingRallySec + deltaSec;
    item.remainingRallySec = Math.max(0, Math.round(nextVal * 10) / 10);
    renderMarchCards();
    calculateInsertion();
  }
}

function setMarchRallyMinute(id, targetMinute) {
  const item = state.marchList.find(m => m.id === id);
  if (item) {
    delete item.targetLandDate;
    delete item.frozenLandDate;
    delete item.startTimestamp;
    delete item.initialRallySec;
    item.hasBeenStarted = false;
    const currentSecs = item.remainingRallySec % 60;
    item.remainingRallySec = Math.round((targetMinute * 60 + currentSecs) * 10) / 10;
    renderMarchCards();
    calculateInsertion();
  }
}

function setMarchRallySecond(id, targetSecond) {
  const item = state.marchList.find(m => m.id === id);
  if (item) {
    delete item.targetLandDate;
    delete item.frozenLandDate;
    delete item.startTimestamp;
    delete item.initialRallySec;
    item.hasBeenStarted = false;
    const currentMins = Math.floor(item.remainingRallySec / 60);
    item.remainingRallySec = Math.round((currentMins * 60 + targetSecond + 0.9) * 10) / 10;
    renderMarchCards();
    calculateInsertion();
  }
}

// --- History Storage & Auto Complete ---
function saveEnemyHistory(tag, name) {
  if (!tag && !name) return;
  const key = `${tag.trim()}:${name.trim()}`;
  if (!state.history.some(h => h.key === key)) {
    state.history.unshift({ key, tag: tag.trim(), name: name.trim(), timestamp: Date.now() });
    if (state.history.length > 20) state.history.pop();
    localStorage.setItem('wos_enemy_history', JSON.stringify(state.history));
  }
}

function loadEnemyHistory() {
  const saved = localStorage.getItem('wos_enemy_history');
  if (saved) {
    try { state.history = JSON.parse(saved); } catch (e) {}
  }
}

function renderHistoryList() {
  const container = document.getElementById('history-list');
  if (!container) return;
  container.innerHTML = '';

  if (state.history.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-400 py-4 text-xs">保存された履歴はありません</div>';
    return;
  }

  state.history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'flex justify-between items-center bg-black/40 p-2 rounded border border-cyan-900/40 text-xs cursor-pointer hover:border-cyan-400';
    div.innerHTML = `
      <div>
        <span class="font-bold text-yellow-400">[${item.tag || '??? '}]</span>
        <span class="text-gray-200 ml-1">${item.name || '不明'}</span>
      </div>
      <button class="btn-game btn-xs btn-primary">適用</button>
    `;
    div.onclick = () => {
      addMarchCard(item.tag, item.name);
      closeHistoryModal();
    };
    container.appendChild(div);
  });
}

// --- Insertion Calculation & Risk Engine (v1.00.13 with Auto-Sort & Multi-Gap Selection) ---
let lastBeepSec = -1;

function calculateInsertion() {
  if (state.marchList.length < 2) return;

  const now = getAdjustedNowTime();

  // 1. Calculate projected land Date for ALL marches using unified helper
  const marchLandData = state.marchList.map((m, originalIdx) => {
    let landDate;
    if (state.mode === 'live') {
      landDate = getProjectedLandDate(m);
    } else {
      const baseStr = document.getElementById('snapshot-base-time').value || '12:00:00';
      const baseSec = parseSecondsFromHHMMSS(baseStr);
      const baseDate = new Date(now);
      baseDate.setUTCHours(Math.floor(baseSec / 3600), Math.floor((baseSec % 3600) / 60), Math.floor(baseSec % 60), 0);
      landDate = new Date(baseDate.getTime() + (m.remainingRallySec + m.marchTimeSec) * 1000);
    }
    return {
      march: m,
      originalIdx: originalIdx,
      landDate: landDate
    };
  });

  // 2. Auto-Sort Marches by Chronological Landing Time
  const sortedLandData = [...marchLandData].sort((a, b) => a.landDate.getTime() - b.landDate.getTime());

  // Check if order is inverted compared to input list
  let isOrderInverted = false;
  for (let i = 0; i < sortedLandData.length; i++) {
    if (sortedLandData[i].originalIdx !== i) {
      isOrderInverted = true;
      break;
    }
  }

  const sortNoticeElem = document.getElementById('auto-sort-notice');
  if (sortNoticeElem) {
    const sequenceStr = sortedLandData.map(d => `相手 ${d.originalIdx + 1}`).join(' ➔ ');
    sortNoticeElem.innerHTML = `<i class="fa-solid fa-circle-info mr-1"></i> 着弾順を自動整列中 (実際の到達順: ${sequenceStr})`;
    sortNoticeElem.classList.toggle('hidden', !isOrderInverted);
  }

  // 3. Build Available Gaps (Between Adjacent Sorted Marches)
  const myMarchStr = document.getElementById('my-march-time').value || '01:30';
  const myMarchSec = parseSecondsFromMMSS(myMarchStr);

  const allGaps = [];
  for (let i = 0; i < sortedLandData.length - 1; i++) {
    const e1 = sortedLandData[i];
    const e2 = sortedLandData[i + 1];
    const deltaSec = Math.max(0, (e2.landDate.getTime() - e1.landDate.getTime()) / 1000);
    
    // Both marches in gap MUST be currently actively running for gap to be actively running
    const gapBothRunning = e1.march.isRunning && e2.march.isRunning;

    // Both marches in gap started check
    const gapBothStarted = (e1.march.hasBeenStarted || e1.march.isRunning) && 
                           (e2.march.hasBeenStarted || e2.march.isRunning);

    // Latest launch max date for this specific gap (launch deadline)
    const launchMaxDate = new Date(e2.landDate.getTime() - 300 - myMarchSec * 1000);
    // Gap is expired when both marches were started AND current time has passed the latest launch deadline
    const isExpired = gapBothStarted && (now.getTime() >= launchMaxDate.getTime());

    // Both marches started AND currently inside valid active launch window (before deadline)
    const gapBothStartedActive = gapBothStarted && !isExpired && (e1.landDate.getTime() > now.getTime() || e2.landDate.getTime() > now.getTime());

    let riskLevel = 'safe';
    let riskIcon = '🟢';
    if (deltaSec < 1.1) { riskLevel = 'danger'; riskIcon = '🔴'; }
    else if (deltaSec < 3.0) { riskLevel = 'warn'; riskIcon = '🟡'; }

    const gapKey = `${e1.originalIdx}_${e2.originalIdx}`;

    allGaps.push({
      index: i,
      gapKey: gapKey,
      rank1: i + 1,
      rank2: i + 2,
      enemy1: e1,
      enemy2: e2,
      deltaSec: deltaSec,
      riskLevel: riskLevel,
      riskIcon: riskIcon,
      isExpired: isExpired,
      bothRunning: gapBothRunning,
      bothStarted: gapBothStartedActive
    });
  }

  // Filter Gaps (v1.01.04 Dual-Protection Architecture):
  // 1. Active Gaps: Both marches were started AND BOTH still active (future landDate) AND launch deadline not passed
  let displayGaps = allGaps.filter(g => g.bothStarted && !g.isExpired);

  // 2. Exception Rule (Action A): If current user selected gap has become EXPIRED, keep it visible in displayGaps
  if (state.selectedGapKey) {
    const selectedExpiredGap = allGaps.find(g => g.gapKey === state.selectedGapKey && g.isExpired);
    if (selectedExpiredGap && !displayGaps.some(g => g.gapKey === state.selectedGapKey)) {
      displayGaps.unshift(selectedExpiredGap);
    }
  }

  // 3. Fallback Rule: Fallback to allGaps for static display ONLY if ALL marches are currently unstarted/idle
  const anyMarchRunning = state.marchList.some(m => m.isRunning);
  if (displayGaps.length === 0 && !anyMarchRunning) {
    displayGaps = allGaps;
  }

  // Selection Logic (v1.01.00 Rule):
  // 1. If state.selectedGapKey exists in displayGaps, maintain selection
  // 2. Otherwise (initial or after deletion), auto-select earliest landing gap (displayGaps[0])
  let activeGapIndex = -1;
  if (state.selectedGapKey) {
    activeGapIndex = displayGaps.findIndex(g => g.gapKey === state.selectedGapKey);
  }

  if (activeGapIndex >= 0) {
    state.selectedGapIndex = activeGapIndex;
  } else {
    state.selectedGapIndex = 0;
    if (displayGaps[0]) {
      state.selectedGapKey = displayGaps[0].gapKey;
    }
  }

  // Render Gap Selector Tabs (Big Buttons)
  renderGapSelectorTabs(displayGaps);

  const activeGap = displayGaps[state.selectedGapIndex] || displayGaps[0];
  const enemy1 = activeGap.enemy1;
  const enemy2 = activeGap.enemy2;
  const enemy1LandDate = enemy1.landDate;
  const enemy2LandDate = enemy2.landDate;
  const gapDeltaSec = activeGap.deltaSec;

  // Update Target Labels (Show rank + enemy number)
  document.getElementById('label-target-enemy1').textContent = `${activeGap.rank1}着 (相手 ${enemy1.originalIdx + 1}) 着弾:`;
  document.getElementById('label-target-enemy2').textContent = `${activeGap.rank2}着 (相手 ${enemy2.originalIdx + 1}) 着弾:`;

  // Earliest Launch (Enemy 1 + 0.3s)
  const launchMinDate = new Date(enemy1LandDate.getTime() + 300 - myMarchSec * 1000);
  // Latest Launch (Enemy 2 - 0.3s)
  const launchMaxDate = new Date(enemy2LandDate.getTime() - 300 - myMarchSec * 1000);
  // Middle Recommended Launch
  const launchMidDate = new Date(launchMinDate.getTime() + (launchMaxDate.getTime() - launchMinDate.getTime()) / 2);

  // Window Span in seconds (max - min)
  const windowSpanSec = Math.max(0, (launchMaxDate.getTime() - launchMinDate.getTime()) / 1000);

  // Countdown to Earliest Launch
  const launchMinCountdownSec = (launchMinDate.getTime() - now.getTime()) / 1000;
  const launchMaxCountdownSec = (launchMaxDate.getTime() - now.getTime()) / 1000;

  // Update UI Elements
  document.getElementById('res-enemy1-land').textContent = formatTimeHHMMSSs(enemy1LandDate);
  document.getElementById('res-enemy2-land').textContent = formatTimeHHMMSSs(enemy2LandDate);
  document.getElementById('res-gap-delta').textContent = `${gapDeltaSec.toFixed(1)}s`;
  document.getElementById('res-window-span').textContent = `${windowSpanSec.toFixed(1)}秒間`;

  document.getElementById('res-launch-min').textContent = formatTimeHHMMSSs(launchMinDate);
  document.getElementById('res-launch-mid').textContent = formatTimeHHMMSSs(launchMidDate);
  document.getElementById('res-launch-max').textContent = formatTimeHHMMSSs(launchMaxDate);

  // Main scheduled launch time display set to Earliest Launch
  document.getElementById('launch-scheduled-time').textContent = formatTimeHHMMSSs(launchMinDate);

  const countdownElem = document.getElementById('launch-countdown');
  const miniTimerElem = document.getElementById('mini-launch-timer');
  const miniTimeElem = document.getElementById('mini-launch-time');
  const miniHeaderElem = document.getElementById('header-mini-launch');
  const miniFillElem = document.getElementById('mini-launch-fill');
  const statusElem = document.getElementById('window-status-text');
  const fillElem = document.getElementById('launch-window-fill');

  const miniSelectedGapElem = document.getElementById('mini-selected-gap');
  if (miniSelectedGapElem) {
    miniSelectedGapElem.innerHTML = `🎯 <span>相手${enemy1.originalIdx + 1}➔相手${enemy2.originalIdx + 1} (${gapDeltaSec.toFixed(1)}s)</span>`;
  }

  if (miniTimeElem) {
    miniTimeElem.textContent = formatTimeHHMMSSs(launchMinDate);
  }

  const isGapStarted = (enemy1.march.hasBeenStarted || enemy1.march.isRunning) && (enemy2.march.hasBeenStarted || enemy2.march.isRunning);
  const isPastDeadline = (launchMaxCountdownSec <= 0);

  // Set Main Countdown Text & Status Bar State (Clean Unified Architecture)
  if (!isGapStarted) {
    // 1. UNSTARTED WAITING STATE: Both marches have not been started yet
    const staticMinCountdownSec = (enemy1.march.remainingRallySec + enemy1.march.marchTimeSec + 0.3) - myMarchSec;
    const staticCountdownStr = formatCountdownMMSSs(Math.max(0, staticMinCountdownSec));
    countdownElem.textContent = staticCountdownStr;
    miniTimerElem.textContent = staticCountdownStr;
    statusElem.className = "text-xs text-center font-bold text-cyan-300 mt-1";
    statusElem.textContent = `⏸ タイマー待機中 (対象相手の「▶ スタート」で進行します)`;
    fillElem.style.left = '0%';
    fillElem.style.width = '0%';
    if (miniFillElem) miniFillElem.style.width = '0%';
    miniHeaderElem.className = "mt-1 text-xs font-bold text-yellow-300 contrast-plate px-2 py-1.5 rounded-lg border border-yellow-500/30";
  } else if (isPastDeadline) {
    // 2. EXPIRED STATE: Marches were started, and current time has passed latest launch deadline
    countdownElem.textContent = "00:00.0";
    miniTimerElem.textContent = "00:00.0";
    statusElem.className = "text-xs text-center font-bold text-red-400 mt-1";
    statusElem.textContent = `❌ 発車タイミングを過ぎました`;
    miniHeaderElem.className = "mt-1 text-xs font-bold text-red-400 contrast-plate px-2 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10";
    fillElem.style.left = '0%';
    fillElem.style.width = '100%';
    if (miniFillElem) miniFillElem.style.width = '100%';
  } else {
    // 3. ACTIVE COUNTDOWN STATE: Marches were started, and deadline is in the future
    const displayCountdownSec = Math.max(0, launchMinCountdownSec);
    const countdownStr = formatCountdownMMSSs(displayCountdownSec);
    countdownElem.textContent = countdownStr;
    miniTimerElem.textContent = countdownStr;

    if (launchMinCountdownSec > 0) {
      // Before earliest launch
      statusElem.className = "text-xs text-center font-bold text-green-300 mt-1";
      statusElem.textContent = `🟢 最速発車まで あと ${formatCountdownMMSSs(launchMinCountdownSec)} (猶予 ${windowSpanSec.toFixed(1)}秒間)`;
      fillElem.style.left = '0%';
      fillElem.style.width = '0%';
      if (miniFillElem) miniFillElem.style.width = '0%';
      miniHeaderElem.className = "mt-1 text-xs font-bold text-yellow-300 contrast-plate px-2 py-1.5 rounded-lg border border-yellow-500/30";
    } else {
      // Currently INSIDE the launch window!
      statusElem.className = "text-xs text-center font-bold text-yellow-300 animate-pulse mt-1";
      statusElem.textContent = `🔥【今すぐ発車可能！】 締め切りまで 残り ${launchMaxCountdownSec.toFixed(1)}秒！`;
      miniHeaderElem.className = "mt-1 text-xs font-bold text-yellow-400 contrast-plate px-2 py-1.5 rounded-lg border border-yellow-500/50 bg-yellow-500/20 animate-pulse";

      // Fill from left to right as time passes inside window (0% -> 100%)
      let elapsedTimeInWindow = windowSpanSec - launchMaxCountdownSec;
      let percentFilled = Math.max(0, Math.min(100, (elapsedTimeInWindow / windowSpanSec) * 100));
      fillElem.style.left = '0%';
      fillElem.style.width = `${percentFilled}%`;
      if (miniFillElem) miniFillElem.style.width = `${percentFilled}%`;
    }
  }

  // Countdown Alert Color Changes (5s / 3s) & Audio Beep (Only when started)
  countdownElem.classList.remove('warning-5s', 'danger-3s');

  if (isGapStarted && !isPastDeadline) {
    const targetTriggerSec = (launchMinCountdownSec > 0) ? launchMinCountdownSec : launchMaxCountdownSec;

    if (targetTriggerSec <= 5 && targetTriggerSec > 3) {
      countdownElem.classList.add('warning-5s');
    } else if (targetTriggerSec <= 3 && targetTriggerSec > 0) {
      countdownElem.classList.add('danger-3s');
    }

    // Audio Beep Notification (plays at 5, 4, 3, 2, 1, 0)
    const currentWholeSec = Math.floor(targetTriggerSec);
    if (targetTriggerSec <= 5 && targetTriggerSec >= 0 && currentWholeSec !== lastBeepSec) {
      lastBeepSec = currentWholeSec;
      playBeep(currentWholeSec === 0 ? 1200 : (currentWholeSec <= 3 ? 980 : 880), 'sine', 0.18);
    }
  }

  // Risk Level Auto Assessment (Only displayed when active / valid)
  const riskBadge = document.getElementById('risk-badge');
  
  if (!isGapStarted || launchMaxCountdownSec < 0) {
    // Hide risk badge when not started or when launch deadline has passed
    riskBadge.style.display = 'none';
  } else {
    riskBadge.style.display = 'inline-flex';
    riskBadge.className = 'risk-badge safe-text';

    if (gapDeltaSec >= 3.0) {
      riskBadge.classList.add('risk-safe');
      riskBadge.innerHTML = `<i class="fa-solid fa-shield-check"></i> 🟢 安全 (発車猶予 ${windowSpanSec.toFixed(1)}s 成功率極高)`;
    } else if (gapDeltaSec >= 1.1) {
      riskBadge.classList.add('risk-warn');
      riskBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 🟡 注意 (発車猶予 ${windowSpanSec.toFixed(1)}s 微調整推奨)`;
    } else {
      riskBadge.classList.add('risk-danger');
      riskBadge.innerHTML = `<i class="fa-solid fa-radiation"></i> 🔴 危険 (着弾差 ${gapDeltaSec.toFixed(1)}s - 同秒判定重複リスク)`;
    }
  }
}

// Cache key for gap tabs DOM diffing
let lastGapsSignature = '';

// Render Multi-March Gap Selector Tab Buttons
function renderGapSelectorTabs(gaps) {
  const container = document.getElementById('gap-selector-container');
  if (!container) return;

  const currentSig = gaps.map(g => `${g.rank1}:${g.enemy1.originalIdx}-${g.rank2}:${g.enemy2.originalIdx}-${g.deltaSec.toFixed(1)}-exp:${g.isExpired}`).join('|') + `_sel:${state.selectedGapIndex}`;
  if (currentSig === lastGapsSignature && container.children.length === gaps.length) {
    return; // Skip DOM recreation if unchanged
  }
  lastGapsSignature = currentSig;
  container.innerHTML = '';

  gaps.forEach((gap, idx) => {
    const btn = document.createElement('button');
    const isActive = idx === state.selectedGapIndex;
    const isExpired = gap.isExpired;

    btn.className = `gap-tab-btn ${isActive ? 'active' : ''} ${isExpired ? 'expired' : ''}`;

    btn.innerHTML = `
      ${isActive ? '🎯 ' : ''}相手${gap.enemy1.originalIdx + 1} <i class="fa-solid fa-arrow-right-long text-xs text-cyan-400 mx-1"></i> 相手${gap.enemy2.originalIdx + 1}
      <span class="ml-1 font-mono">${gap.deltaSec.toFixed(1)}s ${isExpired ? '🏁 経過済' : gap.riskIcon}</span>
    `;

    const selectHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.selectedGapIndex = idx;
      state.selectedGapKey = gap.gapKey;
      lastGapsSignature = ''; // Force redraw on click
      calculateInsertion();
    };
    btn.addEventListener('click', selectHandler);
    btn.addEventListener('pointerdown', selectHandler);

    container.appendChild(btn);
  });
}

// --- Mode Switcher ---
function setMode(modeName) {
  state.mode = modeName;
  document.getElementById('mode-tab-live').classList.toggle('active', modeName === 'live');
  document.getElementById('mode-tab-snapshot').classList.toggle('active', modeName === 'snapshot');
  document.getElementById('snapshot-panel').classList.toggle('hidden', modeName !== 'snapshot');
  calculateInsertion();
}

// --- Global Clock Loop ---
function startClockLoop() {
  setInterval(() => {
    // Update live clock display
    try {
      const now = getAdjustedNowTime();
      const clockElem = document.getElementById('live-clock');
      if (clockElem) {
        clockElem.textContent = formatTimeHHMMSSs(now);
      }
    } catch (e) {
      console.error('Clock display error:', e);
    }

    // Update active timers if live mode is counting down
    if (state.mode === 'live') {
      let cardStateChanged = false;
      state.marchList.forEach(m => {
        if (m.isRunning) {
          if (m.remainingRallySec > 0) {
            m.remainingRallySec = Math.max(0, Math.round((m.remainingRallySec - 0.1) * 10) / 10);
            if (m.remainingRallySec <= 0) {
              m.remainingRallySec = 0;
              m.isRunning = false;
              cardStateChanged = true;
            }
          } else {
            m.isRunning = false;
            cardStateChanged = true;
          }
        }
      });

      if (cardStateChanged) {
        renderMarchCards();
      }

      // Update inputs without disrupting focus
      document.querySelectorAll('.rally-input').forEach((input, index) => {
        if (document.activeElement !== input && state.marchList[index]) {
          input.value = formatCountdownMMSSs(state.marchList[index].remainingRallySec);
        }
      });
      document.querySelectorAll('.land-time-input').forEach((input, index) => {
        if (document.activeElement !== input && state.marchList[index]) {
          input.value = getProjectedLandTimeStr(state.marchList[index]);
        }
      });
    }

    try {
      calculateInsertion();
      updateSimpleCountdown();
    } catch (e) {
      console.error('Calculate insertion error:', e);
    }
  }, 100);
}

// --- Alliance Chat Copy Format & Modular Text Generator (v1.02.26) ---
function buildAllianceChatText(mode, data) {
  const tzStr = state.timezone === 'UTC' ? 'UTC' : 'JST';
  if (mode === 'simple') {
    const statusModeName = data.statusMode === 'rally' ? '相手集結中' : '相手行軍中';
    return `⚔️【ホワサバ 差し込み発車指示】 (${tzStr})
🎯 モード：${statusModeName}
⏰ 自分の発車予定時刻：${data.launchTimeStr} (${tzStr})
🚀 発車まであと：${data.countdownStr}
※相手着弾直後 (0.3秒後) に合わせた自動計算指示です。`;
  }

  // Default multi-march format
  return `⚔️【差し込み防衛通知】 (${tzStr})
敵1: ${data.e1Tag}${data.e1Name} (着弾 ${data.e1Land})
敵2: ${data.e2Tag}${data.e2Name} (着弾 ${data.e2Land})
-----------------------------------
🎯 発車猶予ウィンドウ: ${data.windowSpan}
・最速発車: ${data.launchMin}
・推奨中央: ${data.launchMid} (カウント ${data.countdown})
・最遅発車: ${data.launchMax}`;
}

function copySimpleAllianceChat() {
  if (!simpleLaunchState.isCalculated || !simpleLaunchState.targetLaunchDate) {
    alert('「差し込み計算スタート！」を押して計算を完了させてからコピーしてください。');
    return;
  }

  const launchTimeStr = formatTimeHHMMSS(simpleLaunchState.targetLaunchDate);
  const now = getAdjustedNowTime();
  const diffSec = Math.max(0, (simpleLaunchState.targetLaunchDate.getTime() - now.getTime()) / 1000);
  const countdownStr = formatCountdownMMSSs(diffSec);

  const text = buildAllianceChatText('simple', {
    statusMode: simpleLaunchState.statusMode,
    launchTimeStr: launchTimeStr,
    countdownStr: countdownStr
  });

  navigator.clipboard.writeText(text).then(() => {
    alert('同盟チャット用指示文をクリップボードにコピーしました！');
  }).catch(err => {
    console.error('Clipboard copy error:', err);
    alert('コピーに失敗しました。');
  });
}

function copyChatFormat() {
  const e1 = state.marchList[0] || {};
  const e2 = state.marchList[1] || {};

  const e1Tag = e1.allianceTag ? `[${e1.allianceTag}] ` : '';
  const e1Name = e1.governorName || '敵1';
  const e2Tag = e2.allianceTag ? `[${e2.allianceTag}] ` : '';
  const e2Name = e2.governorName || '敵2';

  const e1Land = document.getElementById('res-enemy1-land')?.textContent || '--:--:--';
  const e2Land = document.getElementById('res-enemy2-land')?.textContent || '--:--:--';
  const launchMin = document.getElementById('res-launch-min')?.textContent || '--:--:--';
  const launchMid = document.getElementById('res-launch-mid')?.textContent || '--:--:--';
  const launchMax = document.getElementById('res-launch-max')?.textContent || '--:--:--';
  const windowSpan = document.getElementById('res-window-span')?.textContent || '0.0秒';
  const countdown = document.getElementById('launch-countdown')?.textContent || '00:00.0';

  const text = buildAllianceChatText('multi', {
    e1Tag, e1Name, e1Land,
    e2Tag, e2Name, e2Land,
    launchMin, launchMid, launchMax, windowSpan, countdown
  });

  navigator.clipboard.writeText(text).then(() => {
    alert('同盟チャット用定型文をコピーしました！');
  }).catch(err => {
    prompt('以下のテキストをコピーしてください:', text);
  });
}

// --- Dual Calculator Logic (Rewritten Time Parser & History/Notes) ---
const calcHistory = [];

function switchCalcTab(mode) {
  state.calc.mode = mode;
  document.getElementById('calc-tab-normal').className = `btn-game btn-xs ${mode === 'normal' ? 'btn-primary' : 'btn-secondary'}`;
  document.getElementById('calc-tab-time').className = `btn-game btn-xs ${mode === 'time' ? 'btn-primary' : 'btn-secondary'}`;
  state.calc.expression = '';
  renderCalcKeypad();
  updateCalcDisplay();
  renderCalcHistory();
}

function renderCalcKeypad() {
  const container = document.getElementById('calc-keypad');
  container.innerHTML = '';

  let keys = [];
  if (state.calc.mode === 'normal') {
    keys = ['C', '⌫', '÷', '×', '7', '8', '9', '-', '4', '5', '6', '+', '1', '2', '3', '=', '0', '.'];
  } else {
    keys = ['C', '⌫', '時', '分', '7', '8', '9', '秒', '4', '5', '6', '+', '1', '2', '3', '-', '0', '='];
  }

  keys.forEach(key => {
    const btn = document.createElement('button');
    btn.className = `btn-game calc-btn ${['+', '-', '×', '÷', '='].includes(key) ? 'btn-accent' : ''}`;
    btn.textContent = key;
    btn.onclick = () => handleCalcKey(key);
    container.appendChild(btn);
  });
}

function handleCalcKey(key) {
  if (key === 'C') {
    state.calc.expression = '';
  } else if (key === '⌫') {
    state.calc.expression = state.calc.expression.slice(0, -1);
  } else if (key === '=') {
    evaluateCalc();
  } else {
    state.calc.expression += key;
  }
  updateCalcDisplay();
}

function updateCalcDisplay() {
  const display = document.getElementById('calc-display');
  display.textContent = state.calc.expression || '0';
}

// Time Expression Parser (Unitless Default = Seconds)
function parseTimeExpressionToSeconds(expr) {
  if (!expr) return 0;

  // Split expression into tokens of numbers with units or standalone numbers, plus operators
  // Matches e.g. "1時", "50分", "42秒", "75", "+", "-"
  const tokenRegex = /(\d+)\s*(時間|時|分|秒)?|([+-])/g;
  let match;
  let totalSec = 0;
  let currentSign = 1;

  while ((match = tokenRegex.exec(expr)) !== null) {
    const numStr = match[1];
    const unit = match[2];
    const op = match[3];

    if (op) {
      currentSign = (op === '-') ? -1 : 1;
      continue;
    }

    if (numStr !== undefined) {
      let val = parseInt(numStr, 10);
      let termSec = 0;

      if (unit === '時間' || unit === '時') {
        termSec = val * 3600;
      } else if (unit === '分') {
        termSec = val * 60;
      } else if (unit === '秒') {
        termSec = val;
      } else {
        // Unitless fallback => SECONDS as per user request
        termSec = val;
      }

      totalSec += currentSign * termSec;
    }
  }

  return totalSec;
}

function formatSecondsToTimeStr(totalSec) {
  let isNeg = totalSec < 0;
  totalSec = Math.abs(totalSec);

  let h = Math.floor(totalSec / 3600);
  let m = Math.floor((totalSec % 3600) / 60);
  let s = Math.floor(totalSec % 60);

  let res = '';
  if (h > 0) res += `${h}時間`;
  if (m > 0 || h > 0) res += `${m}分`;
  res += `${s}秒`;

  return isNeg ? `-${res}` : res;
}

function evaluateCalc() {
  let expr = state.calc.expression;
  if (!expr) return;

  try {
    let resultStr = '';
    if (state.calc.mode === 'normal') {
      let evalExpr = expr.replace(/×/g, '*').replace(/÷/g, '/');
      let res = eval(evalExpr);
      resultStr = String(res);
    } else {
      let totalSec = parseTimeExpressionToSeconds(expr);
      resultStr = formatSecondsToTimeStr(totalSec);
    }

    // Add to history
    saveCalcHistory(expr, resultStr);
    state.calc.expression = resultStr;
  } catch (e) {
    state.calc.expression = 'Error';
  }
}

function saveCalcHistory(expr, result) {
  calcHistory.unshift({
    id: Date.now(),
    expr: expr,
    result: result,
    note: ''
  });
  if (calcHistory.length > 20) calcHistory.pop();
  persistCalcHistory();
  renderCalcHistory();
}

function persistCalcHistory() {
  localStorage.setItem('wos_calc_history', JSON.stringify(calcHistory));
}

function loadCalcHistory() {
  const saved = localStorage.getItem('wos_calc_history');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        calcHistory.length = 0;
        calcHistory.push(...parsed);
      }
    } catch (e) {}
  }
}

function renderCalcHistory() {
  const container = document.getElementById('calc-history-list');
  if (!container) return;
  container.innerHTML = '';

  if (calcHistory.length === 0) {
    container.innerHTML = '<div class="text-gray-500 text-xs text-center py-2">計算履歴はありません</div>';
    return;
  }

  calcHistory.forEach(item => {
    const div = document.createElement('div');
    div.className = 'calc-history-item';
    div.innerHTML = `
      <div class="flex justify-between items-center">
        <span class="text-gray-300 font-mono">${item.expr} = <strong class="text-cyan-300">${item.result}</strong></span>
        <button class="btn-game btn-xs btn-secondary" onclick="useHistoryResult('${item.result}')">再利用</button>
      </div>
      <input type="text" class="game-input text-xs" style="height:28px;" placeholder="メモを入力... (例: 砦差し込み用)" 
             value="${item.note || ''}" onchange="updateCalcHistoryNote(${item.id}, this.value)">
    `;
    container.appendChild(div);
  });
}

function updateCalcHistoryNote(id, noteVal) {
  const item = calcHistory.find(i => i.id === id);
  if (item) {
    item.note = noteVal;
    persistCalcHistory();
  }
}

function useHistoryResult(res) {
  state.calc.expression += res;
  updateCalcDisplay();
}

function clearCalcHistory() {
  calcHistory.length = 0;
  localStorage.removeItem('wos_calc_history');
  renderCalcHistory();
}

// --- 6 Preset Themes Engine & Contrast Safety ---
const THEMES = {
  cyber: { bg: '#080c14', accent: '#00f0ff', text: '#e6f1ff', card: 'rgba(15, 23, 42, 0.75)' },
  magma: { bg: '#1a0508', accent: '#ff3b5c', text: '#ffe6e8', card: 'rgba(38, 10, 16, 0.75)' },
  tactical: { bg: '#05140b', accent: '#00ff88', text: '#e6fff2', card: 'rgba(10, 35, 18, 0.75)' },
  royal: { bg: '#12071a', accent: '#ffb700', text: '#fff8e6', card: 'rgba(28, 14, 40, 0.75)' },
  frost: { bg: '#0a1220', accent: '#38bdf8', text: '#f0f9ff', card: 'rgba(15, 28, 48, 0.75)' },
  light: { bg: '#f1f5f9', accent: '#0284c7', text: '#0f172a', card: 'rgba(255, 255, 255, 0.85)' }
};

function toggleCardAdjustButtons(forceHide) {
  const currentHide = state.settings.hideAdjustButtons || false;
  const nextHide = forceHide !== undefined ? forceHide : !currentHide;
  state.settings.hideAdjustButtons = nextHide;
  saveAppSettings();
  renderMarchCards();
}

function toggleResultMetrics(forceState) {
  const isVisible = forceState !== undefined ? forceState : !(state.settings.showResultMetrics !== false);
  state.settings.showResultMetrics = isVisible;
  updateResultMetricsUI();
  saveAppSettings();
}

function updateResultMetricsUI() {
  const isVisible = state.settings.showResultMetrics !== false;
  const container = document.getElementById('result-metrics-container');
  const icon = document.getElementById('icon-toggle-result-metrics');
  const label = document.getElementById('label-toggle-result-metrics');
  const settingCheckbox = document.getElementById('setting-show-result-metrics');

  if (container) {
    container.style.display = isVisible ? 'grid' : 'none';
  }
  if (icon) {
    icon.className = isVisible ? 'fa-solid fa-eye mr-1' : 'fa-solid fa-eye-slash mr-1';
  }
  if (label) {
    label.textContent = isVisible ? '詳細表示' : '詳細非表示';
  }
  if (settingCheckbox) {
    settingCheckbox.checked = isVisible;
  }
}

function toggleClockControls(forceState) {
  const container = document.getElementById('clock-controls-container');
  const icon = document.getElementById('clock-controls-icon');
  if (!container) return;

  const isCollapsed = forceState !== undefined ? forceState : !container.classList.contains('collapsed');
  container.classList.toggle('collapsed', isCollapsed);

  if (icon) {
    icon.className = isCollapsed ? 'fa-solid fa-chevron-down text-cyan-400' : 'fa-solid fa-chevron-up text-cyan-400';
  }

  state.settings.clockControlsCollapsed = isCollapsed;
  saveAppSettings();
}

function toggleCardVisibility(cardKey, isVisible) {
  state.settings.cardVisibility = state.settings.cardVisibility || {};
  state.settings.cardVisibility[cardKey] = isVisible;
  saveAppSettings();

  const elementMap = {
    'header-mini': ['header-mini-launch'],
    'my-march': ['card-my-march'],
    'enemy-list': ['section-enemy-marches'],
    'result': ['result-card'],
    'simple': ['card-simple-trial'],
    'simple-sub-info': ['simple-sub-info', 'simple-status-label'],
    'alliance-multi': ['card-alliance-multi'],
    'floating-memo': ['floating-memo-window']
  };

  const elemIds = elementMap[cardKey];
  if (elemIds) {
    elemIds.forEach(id => {
      const elem = document.getElementById(id);
      if (elem) {
        elem.style.display = isVisible ? '' : 'none';
      }
    });
  }

  // Link btn-jump-result display with 'result' card visibility (v1.02.37)
  if (cardKey === 'result') {
    const jumpBtn = document.getElementById('btn-jump-result');
    if (jumpBtn) {
      jumpBtn.style.display = isVisible ? '' : 'none';
    }
  }
}

function saveAppSettings() {
  localStorage.setItem('wos_app_settings', JSON.stringify(state.settings));
}

function loadAppSettings() {
  const saved = localStorage.getItem('wos_app_settings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.settings = { ...state.settings, ...parsed };
    } catch (e) {}
  }
  const bgInput = document.getElementById('theme-bg');
  const accentInput = document.getElementById('theme-accent');
  const textInput = document.getElementById('theme-text');
  if (bgInput && state.settings.themeBg) bgInput.value = state.settings.themeBg;
  if (accentInput && state.settings.themeAccent) accentInput.value = state.settings.themeAccent;
  if (textInput && state.settings.themeText) textInput.value = state.settings.themeText;

  applyThemeColors(state.settings.cardBgOverride);
  updateResultMetricsUI();

  // Apply card visibility settings (v1.02.23 & v1.02.27)
  const defaultVisibility = {
    'header-mini': false,
    'my-march': false,
    'enemy-list': false,
    'result': false,
    'simple': true,
    'simple-sub-info': false,
    'alliance-multi': false,
    'floating-memo': false
  };

  state.settings.cardVisibility = { ...defaultVisibility, ...(state.settings.cardVisibility || {}) };

  ['header-mini', 'my-march', 'enemy-list', 'result', 'simple', 'simple-sub-info', 'alliance-multi', 'floating-memo'].forEach(key => {
    const isVisible = !!state.settings.cardVisibility[key];
    const checkbox = document.getElementById(`setting-show-card-${key}`);
    if (checkbox) checkbox.checked = isVisible;
    toggleCardVisibility(key, isVisible);
  });

  // Default simple adjust buttons hidden to true if not explicitly set (v1.02.43)
  const isSimpleAdjustHidden = state.settings.hideSimpleAdjustButtons !== false;
  toggleSimpleAdjustButtons(isSimpleAdjustHidden);

  // Default clock controls collapsed to true if not explicitly set to false (v1.02.29)
  const isClockCollapsed = state.settings.clockControlsCollapsed !== false;
  toggleClockControls(isClockCollapsed);
}

function applyPresetTheme(themeKey) {
  const t = THEMES[themeKey] || THEMES.cyber;
  state.settings.themeBg = t.bg;
  state.settings.themeAccent = t.accent;
  state.settings.themeText = t.text;
  state.settings.cardBgOverride = t.card;

  const bgInput = document.getElementById('theme-bg');
  const accentInput = document.getElementById('theme-accent');
  const textInput = document.getElementById('theme-text');
  if (bgInput) bgInput.value = t.bg;
  if (accentInput) accentInput.value = t.accent;
  if (textInput) textInput.value = t.text;

  applyThemeColors(t.card);
  saveAppSettings();
}

function getLuminance(hexColor) {
  let rgb = parseInt(hexColor.replace('#',''), 16);
  let r = (rgb >> 16) & 0xff;
  let g = (rgb >> 8) & 0xff;
  let b = (rgb >> 0) & 0xff;

  let a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function applyThemeColors(cardBgOverride) {
  const bgLuminance = getLuminance(state.settings.themeBg);
  document.documentElement.style.setProperty('--bg-color', state.settings.themeBg);
  document.documentElement.style.setProperty('--accent-color', state.settings.themeAccent);
  if (cardBgOverride) {
    document.documentElement.style.setProperty('--card-bg', cardBgOverride);
  }
  
  // Strict Contrast Safety Enforcement (WCAG 4.5:1 Guarantee with Inverse Plates)
  if (bgLuminance > 0.45) {
    // Light background => Dark inverse plates for text readability
    document.documentElement.style.setProperty('--text-shadow-color', 'rgba(255,255,255,0.8)');
    document.documentElement.style.setProperty('--text-color', '#0f172a');
    document.documentElement.style.setProperty('--text-plate-bg', 'rgba(15, 23, 42, 0.95)');
    document.documentElement.style.setProperty('--text-plate-border', '#0284c7');
  } else {
    // Dark background => Dark glass plates with glowing neon border
    document.documentElement.style.setProperty('--text-shadow-color', 'rgba(0,0,0,0.85)');
    document.documentElement.style.setProperty('--text-color', state.settings.themeText || '#e6f1ff');
    document.documentElement.style.setProperty('--text-plate-bg', 'rgba(8, 12, 20, 0.85)');
    document.documentElement.style.setProperty('--text-plate-border', 'rgba(0, 240, 255, 0.4)');
  }
}

// --- Modal Openers & Controls ---
function openSettingsModal() { document.getElementById('settings-modal').classList.add('open'); }
function closeSettingsModal() { document.getElementById('settings-modal').classList.remove('open'); }
function openCalcModal() { renderCalcHistory(); document.getElementById('calc-modal').classList.add('open'); switchCalcTab('normal'); }
function closeCalcModal() { document.getElementById('calc-modal').classList.remove('open'); }
function openHistoryModal() { renderHistoryList(); document.getElementById('history-modal').classList.add('open'); }
function closeHistoryModal() { document.getElementById('history-modal').classList.remove('open'); }

function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

// --- DOM Initializer & Startup Control ---
function initApp() {
  loadAppSettings();
  loadEnemyHistory();
  loadEnemyPresets();
  loadCalcHistory();
  loadMyMarchTime();

  if (state.marchList.length < 2) {
    state.marchList = [
      createMarchCardData('', ''),
      createMarchCardData('', '')
    ];
  }

  renderMarchCards();
  calculateInsertion();
  startClockLoop();
  updateTimezoneUI();

  // Tap to start splash handler (Button & Overlay)
  const hideSplash = () => {
    initAudio();
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('hidden');
      setTimeout(() => splash.style.display = 'none', 600);
    }
  };

  const startBtn = document.getElementById('btn-start');
  const splashContainer = document.getElementById('splash-screen');
  if (startBtn) {
    startBtn.addEventListener('click', hideSplash);
    startBtn.addEventListener('pointerdown', hideSplash);
  }
  if (splashContainer) {
    splashContainer.addEventListener('click', hideSplash);
  }

  // Timezone toggle handler
  document.getElementById('btn-tz-toggle')?.addEventListener('click', () => {
    toggleTimezoneBadge();
  });

function toggleTimezoneBadge() {
  state.timezone = state.timezone === 'UTC' ? 'LOCAL' : 'UTC';
  updateTimezoneUI();
  calculateInsertion();
  renderMarchCards();
}

function updateTimezoneUI() {
  const btn = document.getElementById('btn-tz-toggle');
  if (btn) {
    btn.innerHTML = `<i class="fa-solid fa-globe"></i> ${state.timezone}`;
  }

  const badges = [
    { elem: document.getElementById('tz-indicator-badge'), fullText: true },
    { elem: document.getElementById('simple-tz-badge'), fullText: false },
    { elem: document.getElementById('floating-tz-badge'), fullText: false }
  ];

  badges.forEach(({ elem, fullText }) => {
    if (!elem) return;
    if (state.timezone === 'UTC') {
      elem.className = "px-2 py-0.5 rounded-full text-xs font-black tracking-wide border shadow-md transition-all flex items-center gap-1 bg-yellow-950/90 border-yellow-400 text-yellow-300 shadow-yellow-500/20";
      elem.innerHTML = `<span>🌐 ${fullText ? 'UTC (世界標準時)' : 'UTC'}</span>`;
    } else {
      elem.className = "px-2 py-0.5 rounded-full text-xs font-black tracking-wide border shadow-md transition-all flex items-center gap-1 bg-cyan-950/90 border-cyan-400 text-cyan-300 shadow-cyan-500/20";
      elem.innerHTML = `<span>🇯🇵 ${fullText ? 'JST (ローカル時間)' : 'JST'}</span>`;
    }
  });
}

  // Time fine-tune buttons
  document.querySelectorAll('.tune-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let offsetVal = btn.dataset.offset;
      if (offsetVal === 'reset') {
        state.syncOffsetMs = 0;
      } else {
        state.syncOffsetMs += parseFloat(offsetVal) * 1000;
      }
      const offsetValElem = document.getElementById('offset-val');
      if (offsetValElem) {
        offsetValElem.textContent = `${state.syncOffsetMs >= 0 ? '+' : ''}${(state.syncOffsetMs / 1000).toFixed(1)}s`;
      }
      calculateInsertion();
    });
  });

  // Preset seconds jump
  document.querySelectorAll('.preset-jump-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let targetSec = parseInt(btn.dataset.sec, 10);
      let now = new Date();
      let curSec = now.getSeconds();
      let diffSec = targetSec - curSec;
      state.syncOffsetMs = diffSec * 1000;
      const offsetValElem = document.getElementById('offset-val');
      if (offsetValElem) {
        offsetValElem.textContent = `${state.syncOffsetMs >= 0 ? '+' : ''}${(state.syncOffsetMs / 1000).toFixed(1)}s`;
      }
      calculateInsertion();
    });
  });

  // My march time save handler
  document.getElementById('my-march-time')?.addEventListener('change', (e) => {
    saveMyMarchTime(e.target.value);
  });

  // Global Start All Timer (batch starts all currently non-running marches)
  document.getElementById('btn-start-all')?.addEventListener('click', () => {
    initAudio();
    state.marchList.forEach(m => {
      if (!m.isRunning) {
        startMarchTimer(m.id, true);
      }
    });
    renderMarchCards();
    calculateInsertion();
  });

  // Add March Button
  document.getElementById('btn-add-march')?.addEventListener('click', () => {
    addMarchCard();
  });

  // Copy Chat Button
  document.getElementById('btn-share-chat')?.addEventListener('click', copyChatFormat);

  // Bottom Navigation & Modal Listeners
  document.getElementById('btn-open-calc')?.addEventListener('click', openCalcModal);
  document.getElementById('btn-open-history')?.addEventListener('click', openHistoryModal);
  document.getElementById('btn-open-settings')?.addEventListener('click', openSettingsModal);

  // Clear History
  document.getElementById('btn-clear-history')?.addEventListener('click', () => {
    state.history = [];
    localStorage.removeItem('wos_enemy_history');
    renderHistoryList();
  });

  // Theme & Settings Handlers
  document.getElementById('theme-bg')?.addEventListener('input', (e) => {
    state.settings.themeBg = e.target.value;
    applyThemeColors();
    saveAppSettings();
  });

  document.getElementById('theme-accent')?.addEventListener('input', (e) => {
    state.settings.themeAccent = e.target.value;
    applyThemeColors();
    saveAppSettings();
  });

  document.getElementById('theme-text')?.addEventListener('input', (e) => {
    state.settings.themeText = e.target.value;
    applyThemeColors();
    saveAppSettings();
  });

  // Big Clear All Marches Button Listener
  document.getElementById('btn-clear-all-marches')?.addEventListener('click', clearAllMarches);

  // Strategy Note Modal Listeners
  document.getElementById('btn-toggle-note')?.addEventListener('click', openStrategyNoteModal);

  // Settings Checkbox Listeners
  document.getElementById('setting-show-result-metrics')?.addEventListener('change', (e) => {
    toggleResultMetrics(e.target.checked);
  });

  // Alliance Modal Backdrop Close Listeners
  ['alliance-member-modal', 'alliance-selection-modal'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('open');
        }
      });
    }
  });

  // Local Storage and App state fully initialized
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Floating Jump Button Helper
function jumpToResultCard() {
  const elem = document.getElementById('result-card');
  if (elem) elem.scrollIntoView({ behavior: 'smooth' });
}

// Strategy Note Modal Handlers
function openStrategyNoteModal() {
  const modal = document.getElementById('strategy-note-modal');
  const textarea = document.getElementById('strategy-note-text');
  if (textarea) textarea.value = state.strategyNote;
  if (modal) modal.classList.add('open');
}

function closeStrategyNoteModal() {
  const modal = document.getElementById('strategy-note-modal');
  if (modal) modal.classList.remove('open');
}

function saveStrategyNote() {
  const textarea = document.getElementById('strategy-note-text');
  if (textarea) {
    state.strategyNote = textarea.value;
    localStorage.setItem('wos_strategy_note', state.strategyNote);
    closeStrategyNoteModal();
    alert('作戦メモを保存しました！');
  }
}

// === v1.02.02 TRIAL: Super Simple Launch Mode Controller ===
let simpleLaunchState = {
  statusMode: 'rally', // 'rally' or 'march'
  isCalculated: false,
  calcStartTime: null,
  startRemSec: 180,
  enemyLandDate: null,
  targetLaunchDate: null,
  myMarchSec: 90,
  enemyMarchSec: 135
};

function toggleSimpleAdjustButtons(forceState) {
  const container = document.getElementById('simple-adjust-buttons-container');
  const icon = document.getElementById('icon-toggle-simple-adjust');
  const label = document.getElementById('label-toggle-simple-adjust');

  if (!container) return;

  const isHidden = forceState !== undefined ? forceState : !container.classList.contains('hidden');
  container.classList.toggle('hidden', isHidden);

  if (icon) {
    icon.className = isHidden ? 'fa-solid fa-sliders' : 'fa-sliders text-cyan-400';
  }
  if (label) {
    label.textContent = isHidden ? '調整表示' : '調整隠す';
  }

  state.settings.hideSimpleAdjustButtons = isHidden;
  saveAppSettings();
}

function setSimpleStatusMode(mode) {
  simpleLaunchState.statusMode = mode;
  const btnRally = document.getElementById('btn-simple-mode-rally');
  const btnMarch = document.getElementById('btn-simple-mode-march');
  const labelRem = document.getElementById('label-simple-remaining-time');
  const groupEnemyMarch = document.getElementById('group-simple-enemy-march');

  if (mode === 'rally') {
    if (btnRally) btnRally.className = "btn-game btn-sm flex-1 font-bold btn-primary active shadow";
    if (btnMarch) btnMarch.className = "btn-game btn-sm flex-1 font-bold btn-secondary";
    if (labelRem) labelRem.textContent = "相手の集結残り時間 (MM:SS)";
    if (groupEnemyMarch) groupEnemyMarch.style.display = "block";
  } else {
    if (btnRally) btnRally.className = "btn-game btn-sm flex-1 font-bold btn-secondary";
    if (btnMarch) btnMarch.className = "btn-game btn-sm flex-1 font-bold btn-primary active shadow";
    if (labelRem) labelRem.textContent = "相手の行軍残り時間 (MM:SS)";
    if (groupEnemyMarch) groupEnemyMarch.style.display = "none";
  }
}

function setSimpleRemainingMinute(targetMins) {
  const elem = document.getElementById('simple-remaining-time');
  if (!elem) return;
  let curSec = parseSecondsFromMMSS(elem.value);
  let secondsOnly = curSec % 60;
  let newTotalSec = targetMins * 60 + secondsOnly;
  elem.value = formatCountdownMMSS(newTotalSec);
  if (simpleLaunchState.isCalculated) {
    recalculateSimpleLaunchState(newTotalSec);
  }
}

function setSimpleRemainingSecond(targetSecs) {
  const elem = document.getElementById('simple-remaining-time');
  if (!elem) return;
  let curSec = parseSecondsFromMMSS(elem.value);
  let minutesOnly = Math.floor(curSec / 60);
  let newTotalSec = minutesOnly * 60 + targetSecs;
  elem.value = formatCountdownMMSS(newTotalSec);
  if (simpleLaunchState.isCalculated) {
    recalculateSimpleLaunchState(newTotalSec);
  }
}

function adjustSimpleRemainingTime(deltaSec) {
  const elem = document.getElementById('simple-remaining-time');
  if (!elem) return;
  let curSec;
  if (simpleLaunchState.isCalculated && simpleLaunchState.calcStartTime) {
    const now = getAdjustedNowTime();
    const elapsedSec = (now.getTime() - simpleLaunchState.calcStartTime.getTime()) / 1000;
    curSec = Math.max(0, simpleLaunchState.startRemSec - elapsedSec);
  } else {
    curSec = parseSecondsFromMMSS(elem.value);
  }

  let newTotalSec = Math.max(0, Math.round((curSec + deltaSec) * 10) / 10);
  elem.value = formatCountdownMMSS(newTotalSec);
  if (simpleLaunchState.isCalculated) {
    recalculateSimpleLaunchState(newTotalSec);
  }
}

function recalculateSimpleLaunchState(newRemSec) {
  const now = getAdjustedNowTime();
  const myStr = document.getElementById('simple-my-march')?.value || '01:30';
  const enemyStr = document.getElementById('simple-enemy-march')?.value || '02:15';

  const mySec = parseSecondsFromMMSS(myStr);
  const enemySec = parseSecondsFromMMSS(enemyStr);

  let enemyLandDate;
  if (simpleLaunchState.statusMode === 'rally') {
    enemyLandDate = new Date(now.getTime() + (newRemSec + enemySec) * 1000);
  } else {
    enemyLandDate = new Date(now.getTime() + newRemSec * 1000);
  }

  const targetLaunchDate = new Date(enemyLandDate.getTime() + 300 - mySec * 1000);

  simpleLaunchState.calcStartTime = now;
  simpleLaunchState.startRemSec = newRemSec;
  simpleLaunchState.enemyLandDate = enemyLandDate;
  simpleLaunchState.targetLaunchDate = targetLaunchDate;
  simpleLaunchState.myMarchSec = mySec;
  simpleLaunchState.enemyMarchSec = enemySec;

  updateSimpleCountdown();
}

function triggerSimpleEnemyLaunch() {
  initAudio();
  const myStr = document.getElementById('simple-my-march')?.value || '01:30';
  const enemyStr = document.getElementById('simple-enemy-march')?.value || '02:15';
  const remStr = document.getElementById('simple-remaining-time')?.value || '03:00';

  const mySec = parseSecondsFromMMSS(myStr);
  const enemySec = parseSecondsFromMMSS(enemyStr);
  const remSec = parseSecondsFromMMSS(remStr);

  const now = getAdjustedNowTime();
  let enemyLandDate;

  if (simpleLaunchState.statusMode === 'rally') {
    // [集結中] 相手着弾時刻 = 現在時刻 + 相手の集結残り時間 + 相手の行軍時間
    enemyLandDate = new Date(now.getTime() + (remSec + enemySec) * 1000);
  } else {
    // [行軍中] 相手着弾時刻 = 現在時刻 + 相手の行軍残り時間
    enemyLandDate = new Date(now.getTime() + remSec * 1000);
  }

  // 自分の発車時刻 = 相手着弾時刻 + 0.3s - 自分の行軍時間
  const targetLaunchDate = new Date(enemyLandDate.getTime() + 300 - mySec * 1000);

  simpleLaunchState.isCalculated = true;
  simpleLaunchState.calcStartTime = now;
  simpleLaunchState.startRemSec = remSec;
  simpleLaunchState.enemyLandDate = enemyLandDate;
  simpleLaunchState.targetLaunchDate = targetLaunchDate;
  simpleLaunchState.myMarchSec = mySec;
  simpleLaunchState.enemyMarchSec = enemySec;

  updateSimpleCountdown();
}

function updateSimpleCountdown() {
  if (!simpleLaunchState.isCalculated || !simpleLaunchState.targetLaunchDate || !simpleLaunchState.enemyLandDate) return;

  const now = getAdjustedNowTime();

  // 1. Live Countdown of Remaining Time Input (Display MM:SS until targetLaunchDate is reached)
  const remInput = document.getElementById('simple-remaining-time');
  const diffSec = (simpleLaunchState.targetLaunchDate.getTime() - now.getTime()) / 1000;

  if (remInput && document.activeElement !== remInput) {
    if (diffSec > 0) {
      const elapsedSec = (now.getTime() - simpleLaunchState.calcStartTime.getTime()) / 1000;
      const currentRemSec = Math.max(0, simpleLaunchState.startRemSec - elapsedSec);
      remInput.value = formatCountdownMMSS(currentRemSec);
    } else {
      // Freeze input display at exact launch deadline time
      const launchElapsedSec = (simpleLaunchState.targetLaunchDate.getTime() - simpleLaunchState.calcStartTime.getTime()) / 1000;
      const launchRemSec = Math.max(0, simpleLaunchState.startRemSec - launchElapsedSec);
      remInput.value = formatCountdownMMSS(launchRemSec);
    }
  }

  // 2. Ultra Prominent Projected Launch Time Display (Display HH:MM:SS of targetLaunchDate)
  const landTimeVal = document.getElementById('simple-land-time-val');
  if (landTimeVal) {
    landTimeVal.textContent = formatTimeHHMMSS(simpleLaunchState.targetLaunchDate);
  }
  const floatingLandTimeVal = document.getElementById('floating-land-time-val');
  if (floatingLandTimeVal) {
    floatingLandTimeVal.textContent = formatTimeHHMMSS(simpleLaunchState.targetLaunchDate);
  }

  // 3. Launch Deadline Countdown Display
  const statusLabel = document.getElementById('simple-status-label');
  const countdownVal = document.getElementById('simple-countdown-val');
  const subInfo = document.getElementById('simple-sub-info');

  if (!statusLabel || !countdownVal || !subInfo) return;

  const modeText = simpleLaunchState.statusMode === 'rally' ? '集結完了後発車' : '行軍着弾';

  if (diffSec > 0) {
    statusLabel.textContent = `🔥 自分の発車ボタンを押すまで あと：`;
    statusLabel.className = "text-xs text-yellow-300 font-bold mt-2 mb-1 animate-pulse";
    countdownVal.textContent = formatCountdownMMSSs(diffSec);
    countdownVal.className = "text-2xl sm:text-3xl font-black text-digital text-cyan-300 animate-pulse";
    subInfo.textContent = `相手着弾直後 (0.3秒後) に自動合わせ中 (${modeText})`;
  } else if (diffSec > -1.0) {
    statusLabel.textContent = "🟢 今すぐ発車せよ！！ (発車推奨ウィンドウ中)";
    statusLabel.className = "text-sm text-green-400 font-black mt-2 mb-1 animate-bounce";
    countdownVal.textContent = "00:00.0";
    countdownVal.className = "text-2xl sm:text-3xl font-black text-digital text-green-400";
    subInfo.textContent = "即座にゲーム画面で発車ボタンをタップ！";
  } else {
    // Stop & reset calculation cleanly once deadline is passed
    simpleLaunchState.isCalculated = false;
    delete simpleLaunchState.calcStartTime;
    delete simpleLaunchState.enemyLandDate;
    delete simpleLaunchState.targetLaunchDate;

    statusLabel.textContent = "時間を設定して「差し込み計算スタート」を押してください";
    statusLabel.className = "text-xs text-cyan-300 font-bold mt-2 mb-1";
    countdownVal.textContent = "--:--.-";
    countdownVal.className = "text-2xl font-black text-digital text-cyan-300";
    subInfo.textContent = "相手着弾 0.3秒後 直後に自動合わせ";

    if (landTimeVal) landTimeVal.textContent = "--:--:--";
    if (floatingLandTimeVal) floatingLandTimeVal.textContent = "--:--:--";

    if (remInput && document.activeElement !== remInput) {
      remInput.value = formatCountdownMMSS(simpleLaunchState.startRemSec);
    }
  }
}

// --- Floating Draggable Mini Memo Window Helpers (v1.02.21 & v1.02.22) ---
function toggleFloatingMemoBody() {
  const body = document.getElementById('floating-memo-body');
  const btn = document.getElementById('btn-toggle-floating-body');
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.innerHTML = isHidden ? '&minus;' : '&#43;';
}

function toggleFloatingMemoLandTime() {
  const box = document.getElementById('floating-land-time-box');
  const btn = document.getElementById('btn-toggle-floating-land-time');
  if (!box) return;
  const isHidden = box.style.display === 'none';
  box.style.display = isHidden ? 'block' : 'none';
  if (btn) {
    btn.className = isHidden 
      ? 'btn-game btn-xs bg-yellow-950/80 border border-yellow-500/50 text-yellow-300 px-1.5 py-0.5 text-[11px]'
      : 'btn-game btn-xs bg-gray-800 border border-gray-600 text-gray-400 px-1.5 py-0.5 text-[11px] opacity-60';
  }
  localStorage.setItem('wos_floating_memo_land_time_show', isHidden ? 'true' : 'false');
}

function toggleFloatingMemoFromCard() {
  const windowElem = document.getElementById('floating-memo-window');
  if (!windowElem) return;
  const isCurrentlyVisible = windowElem.style.display !== 'none';
  const newVisibleState = !isCurrentlyVisible;

  // Sync setting
  toggleCardVisibility('floating-memo', newVisibleState);
  const cb = document.getElementById('setting-show-card-floating-memo');
  if (cb) cb.checked = newVisibleState;

  // Reset position to safe area if opening for first time or out of view
  if (newVisibleState) {
    const rect = windowElem.getBoundingClientRect();
    if (rect.top < 60 || rect.top > window.innerHeight - 50 || rect.left < 0 || rect.left > window.innerWidth - 50) {
      windowElem.style.top = '140px';
      windowElem.style.left = '16px';
      windowElem.style.right = 'auto';
    }
  }
}

function saveFloatingMemoText(text) {
  localStorage.setItem('wos_floating_memo_text', text || '');
}

function initFloatingMemoWindow() {
  const windowElem = document.getElementById('floating-memo-window');
  const headerElem = document.getElementById('floating-memo-header');
  const textareaElem = document.getElementById('floating-memo-textarea');
  const landTimeBox = document.getElementById('floating-land-time-box');
  const landTimeBtn = document.getElementById('btn-toggle-floating-land-time');

  if (!windowElem || !headerElem) return;

  // Restore land time box visibility
  const showLandTime = localStorage.getItem('wos_floating_memo_land_time_show');
  if (landTimeBox && showLandTime === 'false') {
    landTimeBox.style.display = 'none';
    if (landTimeBtn) {
      landTimeBtn.className = 'btn-game btn-xs bg-gray-800 border border-gray-600 text-gray-400 px-1.5 py-0.5 text-[11px] opacity-60';
    }
  }

  // Restore text
  const savedText = localStorage.getItem('wos_floating_memo_text');
  if (textareaElem && savedText !== null) {
    textareaElem.value = savedText;
  }

  // Restore position if saved
  const savedPos = localStorage.getItem('wos_floating_memo_pos');
  if (savedPos) {
    try {
      const pos = JSON.parse(savedPos);
      if (pos.left !== undefined && pos.top !== undefined) {
        // Ensure position is within safe viewport bounds (at least top 60px to clear header)
        const safeTop = Math.max(60, Math.min(pos.top, window.innerHeight - 100));
        const safeLeft = Math.max(0, Math.min(pos.left, window.innerWidth - 100));
        windowElem.style.left = safeLeft + 'px';
        windowElem.style.top = safeTop + 'px';
        windowElem.style.right = 'auto';
      }
    } catch (e) {}
  }

  // Drag logic (Pointer Events for touch & mouse)
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const onPointerDown = (e) => {
    if (e.target.closest('button') || e.target.closest('textarea')) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    const rect = windowElem.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    try {
      headerElem.setPointerCapture(e.pointerId);
    } catch (err) {}
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    let newLeft = e.clientX - offsetX;
    let newTop = e.clientY - offsetY;

    // Boundaries (minTop 60px so it never gets stuck under fixed header)
    const maxLeft = Math.max(0, window.innerWidth - windowElem.offsetWidth);
    const maxTop = Math.max(60, window.innerHeight - windowElem.offsetHeight);
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(60, Math.min(newTop, maxTop));

    windowElem.style.left = newLeft + 'px';
    windowElem.style.top = newTop + 'px';
    windowElem.style.right = 'auto';
  };

  const onPointerUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    try {
      headerElem.releasePointerCapture(e.pointerId);
    } catch (err) {}
    localStorage.setItem('wos_floating_memo_pos', JSON.stringify({
      left: windowElem.offsetLeft,
      top: windowElem.offsetTop
    }));
  };

  headerElem.addEventListener('pointerdown', onPointerDown);
  headerElem.addEventListener('pointermove', onPointerMove);
  headerElem.addEventListener('pointerup', onPointerUp);
  headerElem.addEventListener('pointercancel', onPointerUp);

  // iOS/Android Touch Drag Scroll Prevention
  headerElem.addEventListener('touchmove', (e) => {
    if (isDragging && e.cancelable) {
      e.preventDefault();
    }
  }, { passive: false });
}

// Call initFloatingMemoWindow on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFloatingMemoWindow);
} else {
  initFloatingMemoWindow();
}

// --- Alliance Multi Mass Departure Mode (v1.02.27 Prototype) ---
let allianceMembers = []; // Array of { id, name, marchSec, selected }

function saveAllianceMembers() {
  localStorage.setItem('wos_alliance_members', JSON.stringify(allianceMembers));
  updateAllianceMemberBadges();
}

function loadAllianceMembers() {
  const saved = localStorage.getItem('wos_alliance_members');
  if (saved) {
    try {
      allianceMembers = JSON.parse(saved);
    } catch (e) {}
  }
  if (!Array.isArray(allianceMembers) || allianceMembers.length === 0) {
    // Initial sample data if empty
    allianceMembers = [
      { id: '1', name: '山田', marchSec: 90, selected: true },
      { id: '2', name: '佐藤', marchSec: 105, selected: true },
      { id: '3', name: '田中', marchSec: 130, selected: true }
    ];
  }
  updateAllianceMemberBadges();
}

function updateAllianceMemberBadges() {
  const countBadge = document.getElementById('alliance-member-count-badge');
  const selBadge = document.getElementById('alliance-selected-count-badge');
  const totalBadge = document.getElementById('alliance-total-count-badge');
  const modalCount = document.getElementById('alliance-modal-member-count');

  const total = allianceMembers.length;
  const selected = allianceMembers.filter(m => m.selected !== false).length;

  if (countBadge) countBadge.textContent = total;
  if (selBadge) selBadge.textContent = selected;
  if (totalBadge) totalBadge.textContent = total;
  if (modalCount) modalCount.textContent = total;
}

// Modal Handlers
function openAllianceMemberModal() {
  const modal = document.getElementById('alliance-member-modal');
  if (modal) {
    renderAllianceMemberList();
    modal.classList.add('open');
  }
}

function closeAllianceMemberModal() {
  const modal = document.getElementById('alliance-member-modal');
  if (modal) modal.classList.remove('open');
}

function openAllianceMemberSelectionModal() {
  const modal = document.getElementById('alliance-selection-modal');
  if (modal) {
    renderAllianceSelectionList();
    modal.classList.add('open');
  }
}

function closeAllianceMemberSelectionModal() {
  const modal = document.getElementById('alliance-selection-modal');
  if (modal) modal.classList.remove('open');
}

// Quick Load Sample 65 Members Helper (v1.02.44 Mobile Friendly)
function loadSample65MembersToTextarea() {
  const textarea = document.getElementById('alliance-import-textarea');
  if (!textarea) return;

  const sampleData = `103ch,00:31
Candy,00:20
Ciel,00:28
Cion,00:30
HANA,00:30
nagisa2,00:20
ozi,00:29
Ruru,00:25
Shikky,00:31
sympathy,00:25
アーモンドミルク,00:30
ｲﾝｶﾗﾏｯ,00:23
ウィット,00:25
えま,00:20
おじー,00:23
おしっきーん,00:28
きなぽん,00:20
ぎょぎょ,00:25
こんもちこ,00:29
さくまる,00:28
さぶちゃんマソ,00:20
さぶちゃんマン,00:31
ちむほび,00:20
なりもん,00:29
にゃおち,00:28
にゃんこまろ,00:28
バブ大福,00:26
はるさん,00:31
はるしゃん,00:20
ひなーこ,00:26
ひなこもち,00:28
ひまり,00:31
ぷかぷか,00:20
ぷらころーる,00:30
ぷらりね,00:26
ぺこりん,00:29
べび大福,00:29
ぽてまる,00:26
まめさん,00:25
みにはるさん,00:23
めごらー,00:29
めごらん,00:25
めろにゃおち,00:28
もち大福,00:23
もふ大福,00:23
やん・凡・じーん,00:20
やんちゃんマン,00:23
ゆゆ,00:20
らすかりーの・ぽんてぃーぬ,00:30
らすかる,00:23
りょう,00:25
リリド,00:20
るいち,00:28
ルッカ,00:26
るるたん,00:20
るるるん,00:31
鬼嫁ちゃん,00:20
黒大福もちみ,00:20
新橋,00:29
新八,00:31
昔むかしの鬼嫁ちゃん,00:25
白大福もちこ,00:30
六ZERO,00:26
和,00:26
和菓子屋,00:30`;

  textarea.value = sampleData;
  alert('サンプル65名のデータをテキストエリアにセットしました！「📥 一括登録を実行」を押すと登録されます。');
}

// Template Download & Data Export Helpers (v1.02.30)
function downloadAllianceTemplate(type) {
  let content = '';
  let filename = '';
  let mimeType = '';

  if (type === 'csv') {
    content = `\uFEFF名前,行軍時間
103ch,00:31
Candy,00:20
Ciel,00:28
Cion,00:30
HANA,00:30
nagisa2,00:20
ozi,00:29
Ruru,00:25
Shikky,00:31
sympathy,00:25
アーモンドミルク,00:30
ｲﾝｶﾗﾏｯ,00:23
ウィット,00:25
えま,00:20
おじー,00:23
おしっきーん,00:28
きなぽん,00:20
ぎょぎょ,00:25
こんもちこ,00:29
さくまる,00:28
さぶちゃんマソ,00:20
さぶちゃんマン,00:31
ちむほび,00:20
なりもん,00:29
にゃおち,00:28
にゃんこまろ,00:28
バブ大福,00:26
はるさん,00:31
はるしゃん,00:20
ひなーこ,00:26
ひなこもち,00:28
ひまり,00:31
ぷかぷか,00:20
ぷらころーる,00:30
ぷらりね,00:26
ぺこりん,00:29
べび大福,00:29
ぽてまる,00:26
まめさん,00:25
みにはるさん,00:23
めごらー,00:29
めごらん,00:25
めろにゃおち,00:28
もち大福,00:23
もふ大福,00:23
やん・凡・じーん,00:20
やんちゃんマン,00:23
ゆゆ,00:20
らすかりーの・ぽんてぃーぬ,00:30
らすかる,00:23
りょう,00:25
リリド,00:20
るいち,00:28
ルッカ,00:26
るるたん,00:20
るるるん,00:31
鬼嫁ちゃん,00:20
黒大福もちみ,00:20
新橋,00:29
新八,00:31
昔むかしの鬼嫁ちゃん,00:25
白大福もちこ,00:30
六ZERO,00:26
和,00:26
和菓子屋,00:30
`;
    filename = 'wos_alliance_template.csv';
    mimeType = 'text/csv;charset=utf-8;';
  } else {
    content = `# 【ホワサバ同盟員リスト用テンプレート】
# 形式: 名前, 行軍時間 (MM:SS)
# （ハッシュ記号 # から始まる行はコメントとして無視されます）

103ch,00:31
Candy,00:20
Ciel,00:28
Cion,00:30
HANA,00:30
nagisa2,00:20
ozi,00:29
Ruru,00:25
Shikky,00:31
sympathy,00:25
アーモンドミルク,00:30
ｲﾝｶﾗﾏｯ,00:23
ウィット,00:25
えま,00:20
おじー,00:23
おしっきーん,00:28
きなぽん,00:20
ぎょぎょ,00:25
こんもちこ,00:29
さくまる,00:28
さぶちゃんマソ,00:20
さぶちゃんマン,00:31
ちむほび,00:20
なりもん,00:29
にゃおち,00:28
にゃんこまろ,00:28
バブ大福,00:26
はるさん,00:31
はるしゃん,00:20
ひなーこ,00:26
ひなこもち,00:28
ひまり,00:31
ぷかぷか,00:20
ぷらころーる,00:30
ぷらりね,00:26
ぺこりん,00:29
べび大福,00:29
ぽてまる,00:26
まめさん,00:25
みにはるさん,00:23
めごらー,00:29
めごらん,00:25
めろにゃおち,00:28
もち大福,00:23
もふ大福,00:23
やん・凡・じーん,00:20
やんちゃんマン,00:23
ゆゆ,00:20
らすかりーの・ぽんてぃーぬ,00:30
らすかる,00:23
りょう,00:25
リリド,00:20
るいち,00:28
ルッカ,00:26
るるたん,00:20
るるるん,00:31
鬼嫁ちゃん,00:20
黒大福もちみ,00:20
新橋,00:29
新八,00:31
昔むかしの鬼嫁ちゃん,00:25
白大福もちこ,00:30
六ZERO,00:26
和,00:26
和菓子屋,00:30
`;
    filename = 'wos_alliance_template.txt';
    mimeType = 'text/plain;charset=utf-8;';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCurrentAllianceMembers() {
  if (allianceMembers.length === 0) {
    alert('エクスポートする登録メンバーがいません。');
    return;
  }

  const sorted = [...allianceMembers].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  let csvContent = '\uFEFF名前,行軍時間\n';

  sorted.forEach(m => {
    csvContent += `${m.name},${formatCountdownMMSS(m.marchSec)}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wos_alliance_members_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import & Member Management
function importAllianceMembersFromText() {
  const textarea = document.getElementById('alliance-import-textarea');
  if (!textarea || !textarea.value.trim()) {
    alert('テキストを入力してください。');
    return;
  }

  const lines = textarea.value.split('\n');
  let addedCount = 0;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    // Split line into Name and Time string using comma, tab, or space delimiter
    // Example: "山田, 01:30", "佐藤\t1:45", "田中 2:10"
    let name = '';
    let timeStr = '';

    if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      name = parts[0].trim();
      timeStr = parts.slice(1).join(',').trim();
    } else if (trimmed.includes('\t')) {
      const parts = trimmed.split('\t');
      name = parts[0].trim();
      timeStr = parts.slice(1).join('\t').trim();
    } else {
      // Split by first whitespace block
      const spaceIdx = trimmed.search(/\s/);
      if (spaceIdx !== -1) {
        name = trimmed.substring(0, spaceIdx).trim();
        timeStr = trimmed.substring(spaceIdx).trim();
      }
    }

    if (name && timeStr) {
      const marchSec = parseSecondsFromMMSS(timeStr);

      if (!isNaN(marchSec) && marchSec > 0) {
        // Prevent duplicate names by updating existing or adding new
        const existing = allianceMembers.find(m => m.name === name);
        if (existing) {
          existing.marchSec = marchSec;
        } else {
          allianceMembers.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name: name,
            marchSec: marchSec,
            selected: true
          });
        }
        addedCount++;
      }
    }
  });

  saveAllianceMembers();
  renderAllianceMemberList();
  alert(`${addedCount} 名のメンバーを登録/更新しました！`);
}

function clearAllianceImportTextarea() {
  const textarea = document.getElementById('alliance-import-textarea');
  if (textarea) textarea.value = '';
}

function clearAllAllianceMembers() {
  if (confirm('登録済みのすべての同盟メンバーを削除しますか？')) {
    allianceMembers = [];
    saveAllianceMembers();
    renderAllianceMemberList();
  }
}

function deleteAllianceMember(id) {
  allianceMembers = allianceMembers.filter(m => m.id !== id);
  saveAllianceMembers();
  renderAllianceMemberList();
}

function renderAllianceMemberList() {
  const container = document.getElementById('alliance-member-list-container');
  if (!container) return;
  container.innerHTML = '';

  if (allianceMembers.length === 0) {
    container.innerHTML = '<div class="text-gray-500 text-xs text-center py-3">登録メンバーがいません</div>';
    return;
  }

  // Sort by Japanese Gojūon (あいうえお順)
  const sorted = [...allianceMembers].sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  sorted.forEach(m => {
    const div = document.createElement('div');
    div.className = 'flex justify-between items-center bg-black/60 p-2 rounded border border-cyan-900/60 text-xs';
    div.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="font-bold text-cyan-200">${m.name}</span>
        <span class="text-gray-400 font-mono text-[11px]">(行軍 ${formatCountdownMMSS(m.marchSec)})</span>
      </div>
      <button class="text-red-400 hover:text-red-300 font-bold px-1.5 py-0.5" onclick="deleteAllianceMember('${m.id}')">&times;</button>
    `;
    container.appendChild(div);
  });

  updateAllianceMemberBadges();
}

// Selection Checklist Modal Logic
function renderAllianceSelectionList() {
  const container = document.getElementById('alliance-selection-list-container');
  const searchInput = document.getElementById('alliance-selection-search');
  if (!container) return;
  container.innerHTML = '';

  const filterText = (searchInput?.value || '').trim().toLowerCase();

  // Sort by Japanese Gojūon
  const sorted = [...allianceMembers].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const filtered = sorted.filter(m => m.name.toLowerCase().includes(filterText));

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-gray-500 text-xs text-center py-3">該当するメンバーがいません</div>';
    return;
  }

  filtered.forEach(m => {
    const isChecked = m.selected !== false;
    const div = document.createElement('label');
    div.className = 'flex items-center justify-between p-2 rounded hover:bg-cyan-950/50 cursor-pointer border-b border-gray-800/60 text-xs';
    div.innerHTML = `
      <div class="flex items-center gap-2">
        <input type="checkbox" class="w-4 h-4 accent-cyan-400" ${isChecked ? 'checked' : ''} onchange="toggleAllianceMemberSelection('${m.id}', this.checked)">
        <span class="font-bold text-gray-200">${m.name}</span>
      </div>
      <span class="text-gray-400 font-mono text-[11px]">${formatCountdownMMSS(m.marchSec)}</span>
    `;
    container.appendChild(div);
  });

  const selNum = document.getElementById('alliance-selection-selected-num');
  const totalNum = document.getElementById('alliance-selection-total-num');
  if (selNum) selNum.textContent = allianceMembers.filter(m => m.selected !== false).length;
  if (totalNum) totalNum.textContent = allianceMembers.length;
}

function toggleAllianceMemberSelection(id, checked) {
  const member = allianceMembers.find(m => m.id === id);
  if (member) {
    member.selected = checked;
    saveAllianceMembers();
    renderAllianceSelectionList();
  }
}

function setAllAllianceSelection(checked) {
  allianceMembers.forEach(m => m.selected = checked);
  saveAllianceMembers();
  renderAllianceSelectionList();
}

// Multi Mass Calculation & Copy Logic (v1.02.41 Sort Mode Support: Name / Time)
let allianceCopySortMode = localStorage.getItem('wos_alliance_copy_sort_mode') || 'name'; // 'name' or 'time'

function setAllianceCopySortMode(mode) {
  allianceCopySortMode = mode;
  localStorage.setItem('wos_alliance_copy_sort_mode', mode);

  const btnName = document.getElementById('btn-copy-sort-name');
  const btnTime = document.getElementById('btn-copy-sort-time');
  const labelBtn = document.getElementById('label-copy-alliance-multi-chat');
  const hintTextElem = document.getElementById('alliance-selection-sort-hint');

  if (btnName) btnName.className = `btn-game btn-xs ${mode === 'name' ? 'btn-primary active' : 'btn-secondary'} py-0.5 px-2 text-[11px] font-bold whitespace-nowrap`;
  if (btnTime) btnTime.className = `btn-game btn-xs ${mode === 'time' ? 'btn-primary active' : 'btn-secondary'} py-0.5 px-2 text-[11px] font-bold whitespace-nowrap`;

  const modeName = mode === 'name' ? 'あいうえお順' : '出発時間順';
  if (labelBtn) {
    labelBtn.textContent = `📋 選択メンバー全員の指示をコピー (${modeName})`;
  }
  if (hintTextElem) {
    hintTextElem.textContent = `(${modeName}でコピーされます)`;
  }
}

function copyAllianceMultiChat() {
  if (!simpleLaunchState.isCalculated || !simpleLaunchState.enemyLandDate) {
    alert('「🎯 差し込み計算スタート！」を押して計算を開始してからコピーしてください。');
    return;
  }

  // Filter selected members
  const selectedMembers = allianceMembers.filter(m => m.selected !== false);
  if (selectedMembers.length === 0) {
    alert('送信対象のメンバーが1人も選択されていません。「👥 送信選択」からメンバーにチェックを入れてください。');
    return;
  }

  const enemyLandDate = simpleLaunchState.enemyLandDate;

  // Calculate each member's target launch date
  const memberWithDates = selectedMembers.map(m => {
    const targetLaunchDate = new Date(enemyLandDate.getTime() + 300 - m.marchSec * 1000);
    return {
      member: m,
      targetLaunchDate: targetLaunchDate
    };
  });

  // Sort based on current mode
  if (allianceCopySortMode === 'time') {
    // Sort by target launch time (earliest first)
    memberWithDates.sort((a, b) => a.targetLaunchDate.getTime() - b.targetLaunchDate.getTime());
  } else {
    // Sort by Japanese Gojūon (あいうえお順)
    memberWithDates.sort((a, b) => a.member.name.localeCompare(b.member.name, 'ja'));
  }

  const tzStr = state.timezone === 'UTC' ? 'UTC' : 'JST';
  const statusModeName = simpleLaunchState.statusMode === 'rally' ? '相手集結中' : '相手行軍中';
  const sortModeTitle = allianceCopySortMode === 'time' ? '出発時間順' : 'あいうえお順';

  let text = `⚔️【同盟一斉差し込み発車指示】 (${tzStr}・${sortModeTitle})
🎯 相手状態: ${statusModeName} (着弾予定 ${formatTimeHHMMSS(enemyLandDate)})
---------------------------------
`;

  memberWithDates.forEach(item => {
    const m = item.member;
    const launchTimeStr = formatTimeHHMMSS(item.targetLaunchDate);
    text += `・${m.name} (${formatCountdownMMSS(m.marchSec)}) ➔ ${launchTimeStr} 発車\n`;
  });

  text += `---------------------------------
※各自の行軍時間に合わせて自動最適化済み`;

  navigator.clipboard.writeText(text).then(() => {
    alert(`選択中の同盟メンバー ${memberWithDates.length} 名分の発車指示をクリップボードにコピーしました！ (${sortModeTitle})`);
  }).catch(err => {
    console.error('Clipboard copy error:', err);
    alert('コピーに失敗しました。');
  });
}

// Restore sort mode state on init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    loadAllianceMembers();
    setAllianceCopySortMode(allianceCopySortMode);
  });
} else {
  loadAllianceMembers();
  setAllianceCopySortMode(allianceCopySortMode);
}

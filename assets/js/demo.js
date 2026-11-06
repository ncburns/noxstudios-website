(() => {
  'use strict';

  function makeSounds(onStatus) {
    let enabled = true;
    let context;
    let gain;
    let generation = 0;
    let useMedia = false;
    let needsRetry = false;
    const playing = new Set();
    const decoded = new Map();
    const clips = window.HEXLY_DEMO_AUDIO || {};
    const report = state => { needsRetry = state === 'blocked'; onStatus(state); };
    const stop = () => {
      generation++;
      playing.forEach(source => { try { source.stop ? source.stop() : source.pause(); } catch (_) {} });
      playing.clear();
    };
    const unlock = () => {
      if (!enabled || useMedia) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) { useMedia = true; return; }
      try {
        if (!context) {
          context = new AudioContext();
          gain = context.createGain(); gain.gain.value = .85; gain.connect(context.destination);
          //Decode embedded bytes: no fetch, local-file CORS, or audio-server dependency.
          Object.entries(clips).forEach(([event, uri]) => {
            const encoded = uri.slice(uri.indexOf(',') + 1);
            const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
            decoded.set(event, context.decodeAudioData(bytes.buffer).catch(() => null));
          });
        }
        if (context.state !== 'running') context.resume().catch(() => {});
      } catch (_) { useMedia = true; }
    };
    const playMedia = (event, rate, run) => {
      if (!enabled || run !== generation || document.hidden) return;
      try {
        const audio = new Audio(clips[event]);
        audio.volume = .85; audio.playbackRate = rate;
        audio.preservesPitch = false; audio.webkitPreservesPitch = false;
        playing.add(audio);
        const cleanup = () => playing.delete(audio);
        audio.addEventListener('ended', cleanup, {once:true});
        audio.addEventListener('error', () => { cleanup(); if (run === generation && enabled) report('blocked'); }, {once:true});
        audio.play().then(() => {
          if (!enabled || run !== generation) audio.pause(); else report('ready');
        }).catch(() => { cleanup(); if (run === generation && enabled) report('blocked'); });
      } catch (_) { report('blocked'); }
    };
    const play = async (event, rate = 1) => {
      if (!enabled) return;
      if (!clips[event]) { report('blocked'); return; }
      unlock();
      const run = generation;
      if (useMedia || !context) { playMedia(event, rate, run); return; }
      try {
        const buffer = await decoded.get(event);
        if (!buffer) throw new Error('Audio could not decode');
        if (!enabled || run !== generation || document.hidden) return;
        if (context.state !== 'running') {
          let timeout;
          try {
            await Promise.race([context.resume(), new Promise((_, reject) => {
              timeout = setTimeout(() => reject(new Error('Audio needs another gesture')), 1200);
            })]);
          } finally { clearTimeout(timeout); }
        }
        if (!enabled || run !== generation || document.hidden) return;
        if (context.state !== 'running') throw new Error('Audio is suspended');
        const source = context.createBufferSource();
        source.buffer = buffer; source.playbackRate.value = rate; source.connect(gain);
        source.onended = () => { playing.delete(source); source.disconnect(); };
        playing.add(source); source.start(); report('ready');
      } catch (_) {
        if (enabled && run === generation && !document.hidden) {
          useMedia = true;
          playMedia(event, rate, run);
        }
      }
    };
    return {
      unlock, play, stop,
      toggle() {
        if (needsRetry) { enabled = true; report('ready'); unlock(); return true; }
        enabled = !enabled;
        if (!enabled) { stop(); report('muted'); } else { report('ready'); unlock(); }
        return enabled;
      },
      pause() { stop(); if (context && context.state === 'running') context.suspend().catch(() => {}); }
    };
  }

  document.querySelectorAll('[data-demo]').forEach(demo => {
    const board = demo.querySelector('.demo-board');
    let cells = [];
    let choices = [];
    let clues = [];
    const puzzles = window.HEXLY_DEMO_PUZZLES || [];
    const savedBoards = new Map();
    const viewport = demo.querySelector('[data-demo-viewport]');
    let currentIndex = 0;
    let zoom = 1;
    const status = demo.querySelector('[data-demo-status]');
    const soundButton = demo.querySelector('[data-demo-sound]');
    const audioNotice = demo.querySelector('[data-audio-notice]');
    const sounds = makeSounds(state => {
      audioNotice.hidden = state !== 'blocked';
      soundButton.querySelector('[data-sound-label]').textContent = state === 'blocked' ? 'Retry' : state === 'muted' ? 'Off' : 'On';
      soundButton.title = state === 'blocked' ? 'Retry sound effects' : state === 'muted' ? 'Enable sound effects' : 'Mute sound effects';
    });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const timers = new Set();
    let focused = null;
    let active = null;
    let solved = false;
    let completing = false;
    let pointer = null;
    let ignoreClick = null;
    let ignoreClickUntil = 0;

    const later = (fn, delay) => {
      const id = setTimeout(() => { timers.delete(id); fn(); }, delay);
      timers.add(id);
      return id;
    };
    const adjacent = (a, b) => {
      const q = +a.dataset.q - +b.dataset.q;
      const r = +a.dataset.r - +b.dataset.r;
      return (Math.abs(q) + Math.abs(r) + Math.abs(q+r)) / 2 === 1;
    };
    const isSelected = cell => cell.classList.contains('is-selected');
    const isMarked = cell => cell.classList.contains('is-marked');
    const refreshFocus = () => cells.forEach(cell => {
      cell.classList.toggle('is-active', cell === active);
      cell.classList.toggle('is-focused', cell === focused);
      cell.classList.toggle('is-neighbor', !!focused && cell.hasAttribute('data-choice') && adjacent(cell, focused));
      if (cell.hasAttribute('data-clue')) cell.setAttribute('aria-pressed', String(cell === focused));
    });
    const announceChoice = cell => {
      cell.setAttribute('aria-pressed', String(isSelected(cell)));
      cell.setAttribute('aria-label', cell.dataset.cellLabel + (isMarked(cell) ? ', marked unused' : isSelected(cell) ? ', selected' : ''));
    };
    const markCell = (cell, animate = true) => {
      cell.classList.add('is-marked');
      if (animate && !reducedMotion.matches) {
        cell.classList.add('is-new-mark');
        later(() => cell.classList.remove('is-new-mark'), 220);
      }
      announceChoice(cell);
    };
    const finish = () => {
      completing = true;
      focused = null;
      refreshFocus();
      cells.forEach(cell => cell.setAttribute('aria-disabled', 'true'));
      const remaining = choices.filter(cell => !isSelected(cell) && !isMarked(cell))
        .sort((a,b) => +a.dataset.q - +b.dataset.q || +a.dataset.r - +b.dataset.r);
      //Same ordered finish reveal and timing as the Pack completion in GameViewModel.
      remaining.forEach((cell, index) => {
        if (reducedMotion.matches) markCell(cell, false);
        else later(() => markCell(cell), index * 38);
      });
      const celebrate = () => {
        completing = false;
        solved = true;
        demo.classList.add('is-solved', 'is-celebrating');
        later(() => demo.classList.remove('is-celebrating'), 260);
        sounds.play('solved');
        status.textContent = 'Solved. Every number matches.';
      };
      status.textContent = 'Every number matches…';
      if (reducedMotion.matches || !remaining.length) celebrate();
      else later(celebrate, remaining.length * 38 + 280);
    };
    const update = (allowFinish = true) => {
      const selected = choices.filter(isSelected);
      let correct = 0;
      let over = false;
      clues.forEach(clue => {
        const count = selected.filter(cell => adjacent(clue, cell)).length;
        const target = +clue.dataset.clue;
        clue.classList.toggle('is-correct', count === target);
        clue.classList.toggle('is-over', count > target);
        if (count === target) correct++;
        if (count > target) over = true;
        clue.setAttribute('aria-label', clue.dataset.cellLabel + ': ' + count + ' selected neighbors' +
          (count === target ? ', correct' : count > target ? ', too many' : ''));
      });
      status.textContent = over ? 'Too many neighbors selected. Tap a selected hex to change it.' : selected.length ?
        correct + ' of ' + clues.length + ' numbers match.' : 'Select a hex without a number.';
      if (allowFinish && correct === clues.length && !solved && !completing) finish();
    };
    const tap = cell => {
      if (solved || completing) return;
      sounds.unlock();
      active = cell;
      if (cell.hasAttribute('data-clue')) {
        //The app clears an existing clue focus before focusing another number.
        focused = focused ? null : cell;
        refreshFocus();
        return;
      }
      focused = null;
      refreshFocus();
      if (isMarked(cell)) {
        status.textContent = 'Clear the unused mark first: hold or right-click the hex again.';
        return;
      }
      const selected = !isSelected(cell);
      cell.classList.toggle('is-selected', selected);
      announceChoice(cell);
      if (selected) {
        cell.classList.add('is-placing');
        later(() => cell.classList.remove('is-placing'), 180);
        //Use the selected count of this exact native Pack puzzle.
        sounds.play('activate', 1 + Math.min(choices.filter(isSelected).length / puzzles[currentIndex].solutionSize, 1) * .08);
      } else sounds.play('deactivate');
      update();
    };
    const mark = cell => {
      if (solved || completing || !cell.hasAttribute('data-choice')) return;
      sounds.unlock();
      active = cell;
      focused = null;
      refreshFocus();
      if (isSelected(cell)) {
        status.textContent = 'Clear the selected hex first.';
        return;
      }
      if (isMarked(cell)) {
        cell.classList.remove('is-marked', 'is-new-mark');
        announceChoice(cell);
        sounds.play('clearMark');
      } else {
        markCell(cell);
        sounds.play('mark');
      }
      update(false);
    };
    const cancelPointer = () => {
      if (pointer) { clearTimeout(pointer.timer); timers.delete(pointer.timer); pointer = null; }
    };
    const bindCells = () => cells.forEach(cell => {
      cell.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !event.isPrimary || solved || completing) return;
        sounds.unlock();
        cancelPointer();
        pointer = {cell, x:event.clientX, y:event.clientY, id:event.pointerId, timer:null};
        if (cell.hasAttribute('data-choice')) pointer.timer = later(() => {
          if (!pointer || pointer.cell !== cell) return;
          ignoreClick = cell;
          ignoreClickUntil = performance.now() + 1200;
          mark(cell);
        }, 350);
      });
      cell.addEventListener('click', event => {
        if (event.detail > 0 && cell === ignoreClick && performance.now() < ignoreClickUntil) {
          event.preventDefault(); ignoreClick = null; return;
        }
        ignoreClick = null;
        tap(cell);
      });
      cell.addEventListener('contextmenu', event => {
        event.preventDefault();
        if (cell === ignoreClick && performance.now() < ignoreClickUntil) return;
        cancelPointer();
        mark(cell);
      });
      cell.addEventListener('keydown', event => {
        if (event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault(); if (!event.repeat) mark(cell);
        }
      });
    });

    const key = cell => cell.dataset.q + ',' + cell.dataset.r;
    const setZoom = (value, center = true) => {
      const oldZoom = zoom;
      const middleX = viewport.scrollLeft + viewport.clientWidth / 2;
      const middleY = viewport.scrollTop + viewport.clientHeight / 2;
      zoom = Math.max(1, Math.min(2.5, value));
      board.style.width = (zoom * 100) + '%';
      viewport.classList.toggle('is-zoomed', zoom > 1);
      demo.querySelector('[data-demo-zoom-label]').textContent = Math.round(zoom * 100) + '%';
      demo.querySelector('[data-demo-zoom-out]').disabled = zoom === 1;
      demo.querySelector('[data-demo-zoom-in]').disabled = zoom === 2.5;
      if (center && zoom > 1) {
        viewport.scrollLeft = middleX * zoom / oldZoom - viewport.clientWidth / 2;
        viewport.scrollTop = middleY * zoom / oldZoom - viewport.clientHeight / 2;
      } else { viewport.scrollLeft = 0; viewport.scrollTop = 0; }
    };
    const renderBoard = puzzle => {
      const radius = puzzle.radius;
      const size = Math.min(38, 336 / (Math.sqrt(3) * (2 * radius + 1)), 316 / (3 * radius + 2));
      const w = Math.sqrt(3) * size, h = size * 2;
      const points = r => Array.from({length:6}, (_,i) => {
        const angle = (i * 60 - 30) * Math.PI / 180;
        return (w/2 + Math.cos(angle)*r).toFixed(4) + ',' + (h/2 + Math.sin(angle)*r).toFixed(4);
      }).join(' ');
      const hex = points(w * .46), ring = points(h * 1.06 * .46);
      const clueMap = new Map(puzzle.clues.map(([q,r,n]) => [q+','+r,n]));
      const rows = {};
      board.innerHTML = [...puzzle.cells].sort((a,b) => a[1]-b[1] || a[0]-b[0]).map(([q,r],i) => {
        const row = r + radius + 1;
        rows[row] = (rows[row] || 0) + 1;
        const n = clueMap.get(q+','+r);
        const label = 'Row '+row+', hex '+rows[row]+(n !== undefined ? ', clue '+n : '');
        const x = 180 + Math.sqrt(3)*size*(q+r/2), y = 170+1.5*size*r;
        const style = 'left:'+((x-w/2)/360*100)+'%;top:'+((y-h/2)/340*100)+'%;width:'+(w/360*100)+'%;height:'+(h/340*100)+'%';
        const id = 'demo-mark-'+currentIndex+'-'+i;
        return `<button class="demo-hex ${n !== undefined ? 'demo-clue' : 'demo-choice'}" type="button" style="${style}" data-q="${q}" data-r="${r}" ${n !== undefined ? 'data-clue="'+n+'"' : 'data-choice'} data-cell-label="${label}" aria-label="${label}" aria-pressed="false" aria-describedby="demo-gestures">
          <svg class="demo-tile" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">
            <defs><mask id="${id}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="110" height="120"><polygon class="tile-mark-draw" points="${hex}" pathLength="100" fill="none" stroke="white" stroke-width="5"/></mask></defs>
            <polygon class="tile-base" points="${hex}"/><polygon class="tile-fill" points="${hex}"/>
            <polygon class="tile-glow" points="${hex}"/><polygon class="tile-border" points="${hex}"/>
            <polygon class="tile-mark" points="${hex}" mask="url(#${id})"/>
            <polygon class="tile-neighbor" points="${hex}"/><polygon class="tile-focus" points="${hex}"/>
            <polygon class="tile-active" points="${ring}"/><polygon class="tile-bloom" points="${hex}"/>
          </svg>${n !== undefined ? '<span class="demo-number" aria-hidden="true">'+n+'</span>' : ''}</button>`;
      }).join('');
      board.style.setProperty('--number-size', (Math.min(18, size * .62) / 360 * 100) + 'cqw');
      board.className = 'demo-board demo-board-' + puzzle.size.toLowerCase();
      board.setAttribute('aria-label', puzzle.size + ' puzzle, ' + puzzle.cells.length + ' hexes');
      demo.querySelector('[data-demo-size]').textContent = puzzle.size + ' · ' + puzzle.cells.length + ' hexes';
      cells = Array.from(board.querySelectorAll('[data-q][data-r]'));
      choices = cells.filter(cell => cell.hasAttribute('data-choice'));
      clues = cells.filter(cell => cell.hasAttribute('data-clue'));
      bindCells();
    };
    const clearPending = () => {
      cancelPointer(); timers.forEach(clearTimeout); timers.clear(); sounds.stop();
      ignoreClick = null;
      demo.classList.remove('is-solved', 'is-celebrating');
    };
    const showBoard = index => {
      if (cells.length) savedBoards.set(currentIndex, {
        selected: choices.filter(isSelected).map(key),
        marked: choices.filter(cell => isMarked(cell) || completing && !isSelected(cell)).map(key),
        solved: solved || completing, zoom,
        left: viewport.scrollLeft, top: viewport.scrollTop
      });
      clearPending();
      currentIndex = index;
      solved = false; completing = false; focused = null; active = null;
      renderBoard(puzzles[index]);
      const saved = savedBoards.get(index);
      if (saved) {
        choices.forEach(cell => {
          cell.classList.toggle('is-selected', saved.selected.includes(key(cell)));
          cell.classList.toggle('is-marked', saved.marked.includes(key(cell)));
          announceChoice(cell);
        });
        solved = saved.solved;
      }
      update(false); refreshFocus();
      if (solved) {
        demo.classList.add('is-solved');
        cells.forEach(cell => cell.setAttribute('aria-disabled','true'));
        status.textContent = 'Solved. Every number matches.';
      }
      setZoom(saved ? saved.zoom : 1, false);
      if (saved) { viewport.scrollLeft = saved.left; viewport.scrollTop = saved.top; }
      demo.querySelector('[data-demo-prev]').disabled = index === 0;
      demo.querySelector('[data-demo-next]').textContent = index < puzzles.length - 1 ? 'Next: '+puzzles[index+1].size+' →' : 'Back to Mini ↻';
    };
    demo.querySelector('[data-demo-prev]').addEventListener('click', () => showBoard(Math.max(0,currentIndex-1)));
    demo.querySelector('[data-demo-next]').addEventListener('click', () => showBoard((currentIndex+1)%puzzles.length));
    demo.querySelector('[data-demo-zoom-in]').addEventListener('click', () => setZoom(zoom+.5));
    demo.querySelector('[data-demo-zoom-out]').addEventListener('click', () => setZoom(zoom-.5));
    window.addEventListener('pointermove', event => {
      if (pointer && event.pointerId === pointer.id && Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>10) {
        ignoreClick = pointer.cell;
        ignoreClickUntil = performance.now()+800;
        cancelPointer();
      }
    }, {passive:true});
    window.addEventListener('pointerup', cancelPointer);
    window.addEventListener('pointercancel', cancelPointer);
    window.addEventListener('blur', cancelPointer);
    board.addEventListener('click', event => {
      if (event.target === board && !solved && !completing) { focused = null; refreshFocus(); }
    });
    soundButton.addEventListener('click', () => {
      const enabled = sounds.toggle();
      soundButton.setAttribute('aria-pressed', String(enabled));
      soundButton.title = enabled ? 'Mute sound effects' : 'Enable sound effects';
      soundButton.querySelector('[data-sound-label]').textContent = enabled ? 'On' : 'Off';
      if (enabled) sounds.play('activate');
    });
    demo.querySelector('[data-demo-reset]').addEventListener('click', () => {
      clearPending(); sounds.play('reset');
      solved = false; completing = false; focused = null; active = null; ignoreClick = null;
      savedBoards.delete(currentIndex);
      cells.forEach(cell => {
        cell.removeAttribute('aria-disabled');
        cell.classList.remove('is-selected','is-marked','is-new-mark','is-placing');
        if (cell.hasAttribute('data-choice')) announceChoice(cell);
      });
      setZoom(1,false); refreshFocus(); update(false);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelPointer(); sounds.pause(); }
    });
    if (puzzles.length) showBoard(0);
  });
})();

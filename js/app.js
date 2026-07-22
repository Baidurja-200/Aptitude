// ============================================================
// AptitudeAce — Core Application
// SPA router, state management, test engine, UI rendering
// ============================================================

const App = {

  // ---- State ----
  state: {
    currentView: 'landing',
    profile: null,
    testHistory: [],
    // Test session
    selectedDifficulty: null,
    selectedCategories: [],
    testQuestions: [],
    currentQuestionIndex: 0,
    answers: {},       // { questionId: selectedOptionIndex }
    flagged: new Set(),
    testStartTime: null,
    questionStartTime: null,
    questionTimes: {},  // { questionId: ms }
    timerInterval: null,
    timeRemaining: 0,  // in seconds
  },

  // ============================================
  //  INITIALIZATION
  // ============================================

  init() {
    this.loadState();
    // If profile exists, show dashboard; else show landing
    if (this.state.profile) {
      this.updateNavAvatar();
      this.navigate('dashboard');
    } else {
      this.navigate('landing');
    }
    // Responsive chart redraw
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (this.state.currentView === 'analytics') {
          Analytics.refreshAllCharts(this.state.testHistory);
        }
      }, 300);
    });
  },

  // ---- Persistence ----
  loadState() {
    try {
      const profile = localStorage.getItem('aptitude_profile');
      const history = localStorage.getItem('aptitude_history');
      if (profile) this.state.profile = JSON.parse(profile);
      if (history) this.state.testHistory = JSON.parse(history);
    } catch (e) {
      console.warn('Failed to load state:', e);
    }
  },

  saveProfile(event) {
    if (event) event.preventDefault();
    const name = document.getElementById('profileName').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    const college = document.getElementById('profileCollege').value.trim();
    const tags = [...document.querySelectorAll('#tagsContainer .tag')].map(t => t.dataset.value);

    if (!name || !email) {
      this.toast('Please fill in your name and email.', 'error');
      return;
    }

    this.state.profile = {
      name, email, college,
      targetCompanies: tags,
      createdAt: this.state.profile?.createdAt || new Date().toISOString()
    };
    localStorage.setItem('aptitude_profile', JSON.stringify(this.state.profile));
    this.updateNavAvatar();
    this.toast('Profile saved successfully! 🎉', 'success');
    this.navigate('dashboard');
  },

  saveHistory() {
    localStorage.setItem('aptitude_history', JSON.stringify(this.state.testHistory));
  },

  // ============================================
  //  NAVIGATION / ROUTER
  // ============================================

  navigate(viewId) {
    // Guard: require profile for all views except landing & profile-setup
    if (!this.state.profile && !['landing', 'profile-setup'].includes(viewId)) {
      this.toast('Please create a profile first to save your progress.', 'info');
      viewId = 'profile-setup';
    }

    // Clean up test if navigating away
    if (this.state.currentView === 'test-arena' && viewId !== 'test-arena') {
      this.cleanupTest();
    }

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + viewId);
    if (target) target.classList.add('active');

    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.view === viewId);
    });

    // Show/hide nav
    const hideNav = ['landing', 'test-arena'].includes(viewId);
    document.getElementById('navbar').style.display = hideNav && viewId === 'test-arena' ? 'block' : '';

    this.state.currentView = viewId;

    // View-specific setup
    switch (viewId) {
      case 'dashboard': this.renderDashboard(); break;
      case 'analytics': this.renderAnalytics(); break;
      case 'profile': this.renderProfile(); break;
      case 'test-config': this.resetTestConfig(); break;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  toggleNav() {
    document.getElementById('navLinks').classList.toggle('open');
  },

  getStarted() {
    if (this.state.profile) {
      this.navigate('dashboard');
    } else {
      this.navigate('profile-setup');
    }
  },

  // ============================================
  //  DASHBOARD
  // ============================================

  renderDashboard() {
    if (!this.state.profile) return;

    document.getElementById('dashboardName').textContent = this.state.profile.name.split(' ')[0];

    const stats = Analytics.computeStats(this.state.testHistory);

    document.getElementById('statTotalTests').textContent = stats.totalTests;
    document.getElementById('statAvgScore').textContent = stats.avgScore + '%';
    document.getElementById('statBestScore').textContent = stats.bestScore + '%';
    document.getElementById('statStreak').textContent = stats.streakDays;

    // Subtext
    if (stats.totalTests === 0) {
      document.getElementById('dashboardSubtext').textContent = 'Take your first test to start tracking progress!';
    } else if (stats.recentTrend === 'improving') {
      document.getElementById('dashboardSubtext').textContent = `You're improving! 📈 Up ${stats.improvementRate}% recently.`;
    } else if (stats.recentTrend === 'declining') {
      document.getElementById('dashboardSubtext').textContent = 'Keep practicing — consistency is key! 💪';
    } else {
      document.getElementById('dashboardSubtext').textContent = 'Ready to practice today?';
    }

    // Recent tests
    this.renderRecentTests();

    // Quick insights
    this.renderQuickInsights(stats);

    // Category bars
    this.renderDashboardCategories(stats);
  },

  renderRecentTests() {
    const container = document.getElementById('recentTestsList');
    const recent = this.state.testHistory.slice(-5).reverse();

    if (recent.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <h4>No tests taken yet</h4>
          <p>Start a practice test to see your history here.</p>
          <button class="btn btn-primary" onclick="App.navigate('test-config')">Take First Test</button>
        </div>`;
      return;
    }

    container.innerHTML = recent.map(test => {
      const pct = Math.round((test.score / test.total) * 100);
      const date = new Date(test.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const diffBadge = `badge-${test.difficulty}`;
      const color = pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--error)';
      return `
        <div class="test-history-item" onclick="App.viewTestResult('${test.id}')">
          <div class="test-info">
            <span class="badge ${diffBadge}">${test.difficulty}</span>
            <div>
              <div style="font-weight:500;">${test.score}/${test.total} correct</div>
              <div class="test-date">${date}</div>
            </div>
          </div>
          <div class="test-score" style="color:${color}">${pct}%</div>
        </div>`;
    }).join('');
  },

  renderQuickInsights(stats) {
    const container = document.getElementById('quickInsights');
    if (stats.totalTests === 0) {
      container.innerHTML = '<p class="text-secondary" style="font-size:0.9rem;">Complete a few tests to get personalized insights.</p>';
      return;
    }

    let insights = [];
    if (stats.weakTopics.length > 0) {
      insights.push(`<div style="margin-bottom:8px;"><span style="color:var(--error);">⚠️</span> Focus on <strong>${stats.weakTopics[0].name}</strong> — only ${stats.weakTopics[0].pct}% accuracy.</div>`);
    }
    if (stats.strongTopics.length > 0) {
      insights.push(`<div style="margin-bottom:8px;"><span style="color:var(--success);">✅</span> Strong in <strong>${stats.strongTopics[0].name}</strong> — ${stats.strongTopics[0].pct}% accuracy!</div>`);
    }
    if (stats.streakDays > 0) {
      insights.push(`<div style="margin-bottom:8px;">🔥 ${stats.streakDays}-day streak! Keep it going!</div>`);
    }
    if (stats.totalTests >= 3) {
      const trend = stats.recentTrend === 'improving' ? '📈 Improving' : stats.recentTrend === 'declining' ? '📉 Needs attention' : '➡️ Stable';
      insights.push(`<div style="margin-bottom:8px;">Trend: <strong>${trend}</strong></div>`);
    }

    container.innerHTML = insights.length > 0
      ? insights.join('')
      : '<p class="text-secondary" style="font-size:0.9rem;">Take more tests for detailed insights.</p>';
  },

  renderDashboardCategories(stats) {
    const container = document.getElementById('dashboardCategoryBars');
    const cats = Object.keys(CATEGORIES);
    const hasData = cats.some(c => stats.categoryScores[c] !== undefined);

    if (!hasData) {
      container.innerHTML = '<p class="text-secondary" style="font-size:0.9rem;">Complete tests to see category breakdown.</p>';
      return;
    }

    container.innerHTML = cats.map(cat => {
      const pct = stats.categoryScores[cat] || 0;
      const color = CATEGORIES[cat].color;
      return `
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:0.85rem;">${CATEGORIES[cat].icon} ${CATEGORIES[cat].name}</span>
            <span style="font-size:0.85rem;font-weight:600;color:${color};">${pct}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width:${pct}%;background:${color};"></div>
          </div>
        </div>`;
    }).join('');
  },

  // ============================================
  //  TEST CONFIG
  // ============================================

  resetTestConfig() {
    this.state.selectedDifficulty = null;
    this.state.selectedCategories = [];
    document.querySelectorAll('.difficulty-card').forEach(c => c.classList.remove('selected'));
    
    this.state.selectedDomains = [];
    document.querySelectorAll('.category-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.cat === 'all' && !c.hasAttribute('data-domain'));
      if (c.hasAttribute('data-domain')) c.classList.remove('active');
    });
    
    document.getElementById('startTestBtn').disabled = true;
    document.getElementById('testConfigHint').textContent = 'Select a difficulty level to begin';
  },

  selectDifficulty(diff) {
    this.state.selectedDifficulty = diff;
    document.querySelectorAll('.difficulty-card').forEach(c => {
      c.classList.toggle('selected', c.classList.contains(diff));
    });
    const d = DIFFICULTIES[diff];
    document.getElementById('startTestBtn').disabled = false;
    document.getElementById('testConfigHint').textContent = `${d.name} — ${d.questions} questions in ${d.time} minutes`;
  },

  toggleCategory(cat) {
    if (cat === 'all') {
      this.state.selectedCategories = [];
      document.querySelectorAll('.category-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.cat === 'all');
      });
    } else {
      // Deactivate 'all' chip
      document.querySelector('.category-chip[data-cat="all"]').classList.remove('active');
      const chip = document.querySelector(`.category-chip[data-cat="${cat}"]`);
      chip.classList.toggle('active');

      const idx = this.state.selectedCategories.indexOf(cat);
      if (idx > -1) this.state.selectedCategories.splice(idx, 1);
      else this.state.selectedCategories.push(cat);

      // If nothing selected, reactivate 'all'
      if (this.state.selectedCategories.length === 0) {
        document.querySelector('.category-chip[data-cat="all"]').classList.add('active');
      }
    }
  },

  toggleDomain(domain) {
    if (!this.state.selectedDomains) this.state.selectedDomains = [];
    const chip = document.querySelector(`.category-chip[data-domain="${domain}"]`);
    if (chip) chip.classList.toggle('active');

    const idx = this.state.selectedDomains.indexOf(domain);
    if (idx > -1) this.state.selectedDomains.splice(idx, 1);
    else this.state.selectedDomains.push(domain);
  },

  // ============================================
  //  TEST ENGINE
  // ============================================

  startTest() {
    const diff = this.state.selectedDifficulty;
    if (!diff) {
      this.toast('Please select a difficulty level.', 'error');
      return;
    }

    const testDomains = this.state.selectedDomains || [];
    const questions = generateTest(diff, this.state.selectedCategories, testDomains);
    if (questions.length === 0) {
      this.toast('No questions available for this combination. Try different filters.', 'error');
      return;
    }

    this.state.testQuestions = questions;
    this.state.currentQuestionIndex = 0;
    this.state.answers = {};
    this.state.flagged = new Set();
    this.state.questionTimes = {};
    this.state.testStartTime = Date.now();
    this.state.questionStartTime = Date.now();
    this.state.timeRemaining = DIFFICULTIES[diff].time * 60;

    this.navigate('test-arena');
    this.renderQuestion();
    this.buildQuestionNav();
    this.startTimer();
  },

  renderQuestion() {
    const q = this.state.testQuestions[this.state.currentQuestionIndex];
    if (!q) return;

    const idx = this.state.currentQuestionIndex;
    const total = this.state.testQuestions.length;

    document.getElementById('currentQNum').textContent = idx + 1;
    document.getElementById('totalQNum').textContent = total;
    document.getElementById('questionText').textContent = q.question;

    // Tags
    const tagsEl = document.getElementById('questionTags');
    const diffBadge = `badge-${q.difficulty}`;
    tagsEl.innerHTML = `
      <span class="badge ${diffBadge}">${q.difficulty}</span>
      <span class="badge badge-info">${CATEGORIES[q.category]?.icon || ''} ${q.topic}</span>
    `;

    // Options
    const optList = document.getElementById('optionsList');
    const letters = ['A', 'B', 'C', 'D'];
    const selectedAnswer = this.state.answers[q.id];

    optList.innerHTML = q.options.map((opt, i) => {
      const isSelected = selectedAnswer === i;
      return `
        <div class="option-item ${isSelected ? 'selected' : ''}" onclick="App.selectOption(${i})">
          <div class="option-marker">${letters[i]}</div>
          <div class="option-text">${opt}</div>
        </div>`;
    }).join('');

    // Flag button
    const flagBtn = document.getElementById('btnFlag');
    flagBtn.textContent = this.state.flagged.has(q.id) ? '🚩 Unflag' : '🚩 Flag';

    // Prev/Next/Submit
    document.getElementById('btnPrev').style.visibility = idx === 0 ? 'hidden' : 'visible';
    if (idx === total - 1) {
      document.getElementById('btnNext').classList.add('hidden');
      document.getElementById('btnSubmit').classList.remove('hidden');
    } else {
      document.getElementById('btnNext').classList.remove('hidden');
      document.getElementById('btnSubmit').classList.add('hidden');
    }

    // Update nav
    this.updateQuestionNav();

    // Track time for prev question
    this.state.questionStartTime = Date.now();
  },

  selectOption(optIndex) {
    const q = this.state.testQuestions[this.state.currentQuestionIndex];
    this.state.answers[q.id] = optIndex;
    this.renderQuestion();
  },

  nextQuestion() {
    this.trackQuestionTime();
    if (this.state.currentQuestionIndex < this.state.testQuestions.length - 1) {
      this.state.currentQuestionIndex++;
      this.renderQuestion();
    }
  },

  prevQuestion() {
    this.trackQuestionTime();
    if (this.state.currentQuestionIndex > 0) {
      this.state.currentQuestionIndex--;
      this.renderQuestion();
    }
  },

  goToQuestion(idx) {
    this.trackQuestionTime();
    this.state.currentQuestionIndex = idx;
    this.renderQuestion();
  },

  toggleFlag() {
    const q = this.state.testQuestions[this.state.currentQuestionIndex];
    if (this.state.flagged.has(q.id)) this.state.flagged.delete(q.id);
    else this.state.flagged.add(q.id);
    this.renderQuestion();
  },

  trackQuestionTime() {
    const q = this.state.testQuestions[this.state.currentQuestionIndex];
    const elapsed = Date.now() - this.state.questionStartTime;
    this.state.questionTimes[q.id] = (this.state.questionTimes[q.id] || 0) + elapsed;
  },

  // Timer
  startTimer() {
    this.updateTimerDisplay();
    this.state.timerInterval = setInterval(() => {
      this.state.timeRemaining--;
      this.updateTimerDisplay();
      if (this.state.timeRemaining <= 0) {
        this.toast('⏰ Time\'s up! Auto-submitting...', 'info');
        this.submitTest();
      }
    }, 1000);
  },

  updateTimerDisplay() {
    const mins = Math.floor(this.state.timeRemaining / 60);
    const secs = this.state.timeRemaining % 60;
    const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    document.getElementById('timerText').textContent = display;

    const timerEl = document.getElementById('timerDisplay');
    timerEl.classList.remove('warning', 'danger');
    const totalTime = DIFFICULTIES[this.state.selectedDifficulty].time * 60;
    if (this.state.timeRemaining < totalTime * 0.1) timerEl.classList.add('danger');
    else if (this.state.timeRemaining < totalTime * 0.25) timerEl.classList.add('warning');
  },

  // Question nav grid
  buildQuestionNav() {
    const grid = document.getElementById('questionNavGrid');
    grid.innerHTML = this.state.testQuestions.map((q, i) => {
      return `<button class="q-nav-btn" data-idx="${i}" onclick="App.goToQuestion(${i})">${i + 1}</button>`;
    }).join('');
  },

  updateQuestionNav() {
    document.querySelectorAll('.q-nav-btn').forEach(btn => {
      const idx = parseInt(btn.dataset.idx);
      const q = this.state.testQuestions[idx];
      btn.className = 'q-nav-btn';
      if (idx === this.state.currentQuestionIndex) btn.classList.add('current');
      else if (this.state.flagged.has(q.id)) btn.classList.add('flagged');
      else if (this.state.answers[q.id] !== undefined) btn.classList.add('answered');
    });
  },

  // Submit
  confirmSubmit() {
    const answered = Object.keys(this.state.answers).length;
    const total = this.state.testQuestions.length;
    const flaggedCount = this.state.flagged.size;
    const unanswered = total - answered;

    const body = document.getElementById('submitModalBody');
    body.innerHTML = `
      <p style="margin-bottom:16px;">Here's your test summary:</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div class="glass-card glass-card-sm" style="text-align:center;padding:12px;">
          <div style="font-size:1.5rem;font-weight:700;color:var(--success);">${answered}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">Answered</div>
        </div>
        <div class="glass-card glass-card-sm" style="text-align:center;padding:12px;">
          <div style="font-size:1.5rem;font-weight:700;color:var(--text-muted);">${unanswered}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">Unanswered</div>
        </div>
        <div class="glass-card glass-card-sm" style="text-align:center;padding:12px;">
          <div style="font-size:1.5rem;font-weight:700;color:var(--warning);">${flaggedCount}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">Flagged</div>
        </div>
        <div class="glass-card glass-card-sm" style="text-align:center;padding:12px;">
          <div style="font-size:1.5rem;font-weight:700;">${this.formatTime(DIFFICULTIES[this.state.selectedDifficulty].time * 60 - this.state.timeRemaining)}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">Time Used</div>
        </div>
      </div>
      ${unanswered > 0 ? '<p style="margin-top:12px;color:var(--warning);font-size:0.9rem;">⚠️ You have unanswered questions!</p>' : ''}
    `;
    this.openModal('submitModal');
  },

  submitTest() {
    this.trackQuestionTime();
    this.closeModal('submitModal');
    this.cleanupTest();

    // Calculate results
    let score = 0;
    const answers = this.state.testQuestions.map(q => {
      const selected = this.state.answers[q.id];
      const isCorrect = selected === q.correctAnswer;
      if (isCorrect) score++;
      return {
        questionId: q.id,
        selected: selected !== undefined ? selected : -1,
        correct: isCorrect,
        timeTaken: this.state.questionTimes[q.id] || 0
      };
    });

    const totalTime = DIFFICULTIES[this.state.selectedDifficulty].time * 60 - this.state.timeRemaining;

    const testResult = {
      id: 'test_' + Date.now(),
      date: new Date().toISOString(),
      difficulty: this.state.selectedDifficulty,
      categories: [...new Set(this.state.testQuestions.map(q => q.category))],
      score,
      total: this.state.testQuestions.length,
      timeTaken: totalTime,
      answers
    };

    this.state.testHistory.push(testResult);
    this.saveHistory();

    // Show results
    this.renderResults(testResult);
    this.navigate('results');
  },

  cleanupTest() {
    if (this.state.timerInterval) {
      clearInterval(this.state.timerInterval);
      this.state.timerInterval = null;
    }
  },

  // ============================================
  //  RESULTS PAGE
  // ============================================

  renderResults(result) {
    const pct = Math.round((result.score / result.total) * 100);

    // Score donut
    setTimeout(() => {
      Analytics.drawDonutChart('scoreDonut', result.score, result.total, true);
    }, 200);

    // Score text (animated counter)
    const scoreEl = document.getElementById('scoreValue');
    const labelEl = document.getElementById('scoreLabel');
    labelEl.textContent = `out of ${result.total}`;
    this.animateCounter(scoreEl, 0, result.score, 1200);

    // Message
    const msgEl = document.getElementById('scoreMessage');
    if (pct >= 90) msgEl.textContent = '🏆 Outstanding Performance!';
    else if (pct >= 75) msgEl.textContent = '🌟 Great Job!';
    else if (pct >= 60) msgEl.textContent = '👍 Good Effort!';
    else if (pct >= 40) msgEl.textContent = '💪 Keep Practicing!';
    else msgEl.textContent = '📚 More Practice Needed';

    // Score meta
    const metaEl = document.getElementById('scoreMeta');
    metaEl.innerHTML = `
      <div class="score-meta-item">
        <span class="meta-value" style="color:var(--success);">${result.score}</span>
        <span class="meta-label">Correct</span>
      </div>
      <div class="score-meta-item">
        <span class="meta-value" style="color:var(--error);">${result.total - result.score - result.answers.filter(a => a.selected === -1).length}</span>
        <span class="meta-label">Wrong</span>
      </div>
      <div class="score-meta-item">
        <span class="meta-value" style="color:var(--text-muted);">${result.answers.filter(a => a.selected === -1).length}</span>
        <span class="meta-label">Skipped</span>
      </div>
      <div class="score-meta-item">
        <span class="meta-value">${this.formatTime(result.timeTaken)}</span>
        <span class="meta-label">Time Taken</span>
      </div>
      <div class="score-meta-item">
        <span class="meta-value text-gradient">${pct}%</span>
        <span class="meta-label">Score</span>
      </div>
    `;

    // Category breakdown
    this.renderCategoryBreakdown(result);

    // Question review
    this._currentResult = result;
    this.renderQuestionReview(result, 'all');
  },

  renderCategoryBreakdown(result) {
    const container = document.getElementById('categoryBreakdown');
    const catData = {};

    result.answers.forEach(ans => {
      const q = QUESTIONS.find(x => x.id === ans.questionId);
      if (!q) return;
      if (!catData[q.category]) catData[q.category] = { correct: 0, total: 0 };
      catData[q.category].total++;
      if (ans.correct) catData[q.category].correct++;
    });

    container.innerHTML = Object.entries(catData).map(([cat, data]) => {
      const pct = Math.round((data.correct / data.total) * 100);
      const colorClass = pct >= 70 ? 'green' : pct >= 50 ? 'yellow' : 'red';
      return `
        <div class="glass-card glass-card-sm category-score-card">
          <div class="cat-header">
            <span class="cat-name">${CATEGORIES[cat]?.icon || ''} ${CATEGORIES[cat]?.name || cat}</span>
            <span class="cat-score">${data.correct}/${data.total}</span>
          </div>
          <div class="progress-bar" style="margin-top:8px;">
            <div class="progress-bar-fill ${colorClass}" style="width:${pct}%;"></div>
          </div>
          <div style="text-align:right;font-size:0.8rem;color:var(--text-muted);margin-top:4px;">${pct}%</div>
        </div>`;
    }).join('');
  },

  renderQuestionReview(result, filter) {
    const container = document.getElementById('reviewQuestionsList');

    // Update filter buttons
    document.querySelectorAll('[id^="filter"]').forEach(btn => btn.classList.remove('btn-primary'));
    const activeFilter = document.getElementById('filter' + filter.charAt(0).toUpperCase() + filter.slice(1));
    if (activeFilter) {
      activeFilter.classList.add('btn-primary');
      activeFilter.classList.remove('btn-ghost');
    }

    const filteredAnswers = result.answers.filter(ans => {
      if (filter === 'all') return true;
      if (filter === 'correct') return ans.correct;
      if (filter === 'wrong') return !ans.correct && ans.selected !== -1;
      if (filter === 'skipped') return ans.selected === -1;
      return true;
    });

    if (filteredAnswers.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No questions in this filter.</p></div>';
      return;
    }

    const letters = ['A', 'B', 'C', 'D'];
    container.innerHTML = filteredAnswers.map((ans, idx) => {
      const q = QUESTIONS.find(x => x.id === ans.questionId);
      if (!q) return '';

      const statusClass = ans.correct ? 'correct-answer' : ans.selected === -1 ? 'skipped' : 'wrong-answer';
      const statusIcon = ans.correct ? '✅' : ans.selected === -1 ? '⬜' : '❌';
      const yourAnswer = ans.selected === -1 ? 'Not answered' : `${letters[ans.selected]}. ${q.options[ans.selected]}`;
      const correctAns = `${letters[q.correctAnswer]}. ${q.options[q.correctAnswer]}`;

      return `
        <div class="review-question ${statusClass}">
          <div class="review-question-number">
            ${statusIcon} Question ${this.state.testQuestions.indexOf(q) + 1}
            <span class="badge badge-info" style="margin-left:8px;">${q.topic}</span>
          </div>
          <p class="review-question-text">${q.question}</p>
          <div class="review-answer-row">
            <div>
              <span class="label">Your Answer:</span>
              <span class="${ans.correct ? 'correct-ans' : ans.selected === -1 ? '' : 'your-answer'}">${yourAnswer}</span>
            </div>
            ${!ans.correct ? `<div><span class="label">Correct Answer:</span> <span class="correct-ans">${correctAns}</span></div>` : ''}
          </div>
          <div class="review-explanation">
            💡 <strong>Explanation:</strong> ${q.explanation}
          </div>
        </div>`;
    }).join('');
  },

  filterReview(filter) {
    if (this._currentResult) {
      // Reset all filter buttons
      document.querySelectorAll('[id^="filter"]').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-ghost');
      });
      this.renderQuestionReview(this._currentResult, filter);
    }
  },

  viewTestResult(testId) {
    const result = this.state.testHistory.find(t => t.id === testId);
    if (!result) return;

    // Reconstruct test questions
    this.state.testQuestions = result.answers.map(a => QUESTIONS.find(q => q.id === a.questionId)).filter(Boolean);

    this.renderResults(result);
    this.navigate('results');
  },

  // ============================================
  //  ANALYTICS PAGE
  // ============================================

  renderAnalytics() {
    const stats = Analytics.computeStats(this.state.testHistory);

    document.getElementById('analyticsTotal').textContent = stats.totalTests;
    document.getElementById('analyticsAvg').textContent = stats.avgScore + '%';
    document.getElementById('analyticsCorrect').textContent = stats.correctAnswers;

    const trendText = stats.recentTrend === 'improving' ? `📈 +${stats.improvementRate}%`
      : stats.recentTrend === 'declining' ? `📉 ${stats.improvementRate}%`
      : '➡️ Stable';
    document.getElementById('analyticsTrend').textContent = trendText;

    // Draw charts after a small delay for DOM rendering
    setTimeout(() => {
      Analytics.refreshAllCharts(this.state.testHistory);
    }, 100);

    // Weak areas
    this.renderWeakAreas(stats);
    this.renderStrongAreas(stats);
  },

  renderWeakAreas(stats) {
    const container = document.getElementById('weakAreasList');
    if (stats.weakTopics.length === 0) {
      container.innerHTML = '<p class="text-muted" style="font-size:0.9rem;">Complete more tests to identify weak areas.</p>';
      return;
    }
    container.innerHTML = stats.weakTopics.map(t => `
      <div class="weak-area-item" style="margin-bottom:8px;">
        <div class="area-icon">📉</div>
        <div class="area-info">
          <h5>${t.name}</h5>
          <p>${t.pct}% accuracy (${t.correct}/${t.total}) · ${CATEGORIES[t.category]?.name || t.category}</p>
        </div>
      </div>`).join('');
  },

  renderStrongAreas(stats) {
    const container = document.getElementById('strongAreasList');
    if (stats.strongTopics.length === 0) {
      container.innerHTML = '<p class="text-muted" style="font-size:0.9rem;">Complete more tests to identify strengths.</p>';
      return;
    }
    container.innerHTML = stats.strongTopics.map(t => `
      <div class="strong-area-item weak-area-item" style="margin-bottom:8px;">
        <div class="area-icon">💪</div>
        <div class="area-info">
          <h5>${t.name}</h5>
          <p>${t.pct}% accuracy (${t.correct}/${t.total}) · ${CATEGORIES[t.category]?.name || t.category}</p>
        </div>
      </div>`).join('');
  },

  // ============================================
  //  PROFILE PAGE
  // ============================================

  renderProfile() {
    const p = this.state.profile;
    if (!p) return;

    const initials = p.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('profileAvatarLg').textContent = initials;
    document.getElementById('profileDisplayName').textContent = p.name;
    document.getElementById('profileDisplayCollege').textContent = p.college || 'No college set';
    document.getElementById('profileDisplayEmail').textContent = p.email;

    const targetsEl = document.getElementById('profileDisplayTargets');
    targetsEl.innerHTML = (p.targetCompanies || []).map(c => `<span class="tag">${c}</span>`).join('');

    const stats = Analytics.computeStats(this.state.testHistory);
    document.getElementById('profileStatTests').textContent = stats.totalTests;
    document.getElementById('profileStatAvg').textContent = stats.avgScore + '%';
    document.getElementById('profileStatBest').textContent = stats.bestScore + '%';
    document.getElementById('profileStatQuestions').textContent = stats.totalQuestions;

    // Full history
    this.renderFullHistory();
  },

  renderFullHistory() {
    const container = document.getElementById('fullTestHistory');
    const history = [...this.state.testHistory].reverse();

    if (history.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No test history yet. Take your first test!</p></div>';
      return;
    }

    container.innerHTML = history.map(test => {
      const pct = Math.round((test.score / test.total) * 100);
      const date = new Date(test.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const diffBadge = `badge-${test.difficulty}`;
      const color = pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--error)';
      const cats = test.categories.map(c => CATEGORIES[c]?.icon || '').join(' ');
      return `
        <div class="test-history-item" onclick="App.viewTestResult('${test.id}')">
          <div class="test-info">
            <span class="badge ${diffBadge}">${test.difficulty}</span>
            <div>
              <div style="font-weight:500;">${test.score}/${test.total} correct ${cats}</div>
              <div class="test-date">${date} · ${this.formatTime(test.timeTaken)}</div>
            </div>
          </div>
          <div class="test-score" style="color:${color}">${pct}%</div>
        </div>`;
    }).join('');
  },

  editProfile() {
    const p = this.state.profile;
    document.getElementById('profileName').value = p.name;
    document.getElementById('profileEmail').value = p.email;
    document.getElementById('profileCollege').value = p.college || '';

    // Restore tags
    const container = document.getElementById('tagsContainer');
    container.querySelectorAll('.tag').forEach(t => t.remove());
    (p.targetCompanies || []).forEach(c => this.addTag(c));

    this.navigate('profile-setup');
  },

  clearTestHistory() {
    if (!confirm('Are you sure you want to clear all test history? This cannot be undone.')) return;
    this.state.testHistory = [];
    this.saveHistory();
    this.toast('Test history cleared.', 'info');
    this.renderProfile();
  },

  deleteProfile() {
    if (!confirm('Are you sure you want to delete your profile and all data? This cannot be undone.')) return;
    localStorage.removeItem('aptitude_profile');
    localStorage.removeItem('aptitude_history');
    this.state.profile = null;
    this.state.testHistory = [];
    this.toast('Profile deleted.', 'info');
    this.navigate('landing');
  },

  // ============================================
  //  TAG INPUT
  // ============================================

  handleTagInput(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const input = event.target;
      const value = input.value.trim();
      if (value) {
        this.addTag(value);
        input.value = '';
      }
    }
  },

  addTag(value) {
    const container = document.getElementById('tagsContainer');
    const input = document.getElementById('tagInput');
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.dataset.value = value;
    tag.innerHTML = `${value} <span class="tag-remove" onclick="this.parentElement.remove()">×</span>`;
    container.insertBefore(tag, input);
  },

  // ============================================
  //  UI HELPERS
  // ============================================

  updateNavAvatar() {
    if (!this.state.profile) return;
    const initials = this.state.profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('navAvatar').textContent = initials;
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  },

  openModal(id) {
    document.getElementById(id).classList.add('active');
  },

  closeModal(id) {
    document.getElementById(id).classList.remove('active');
  },

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  },

  animateCounter(el, from, to, duration) {
    const startTime = performance.now();
    const update = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }
};

// ---- Boot ----
document.addEventListener('DOMContentLoaded', () => App.init());

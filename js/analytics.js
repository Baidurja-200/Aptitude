// ============================================================
// AptitudeAce — Analytics & Chart Engine
// Custom canvas-based charts + stat computation
// ============================================================

const Analytics = {

  // ---- Color palette ----
  colors: {
    indigo: '#6366f1',
    violet: '#8b5cf6',
    cyan: '#06b6d4',
    amber: '#f59e0b',
    emerald: '#10b981',
    rose: '#f43f5e',
    blue: '#3b82f6',
    purple: '#a855f7',
    grid: 'rgba(255,255,255,0.06)',
    gridText: 'rgba(255,255,255,0.4)',
    white: '#e2e8f0',
    muted: '#64748b'
  },

  // ============================================
  //  STAT COMPUTATION
  // ============================================

  computeStats(testHistory) {
    if (!testHistory || testHistory.length === 0) {
      return {
        totalTests: 0, avgScore: 0, bestScore: 0,
        totalQuestions: 0, correctAnswers: 0,
        categoryScores: {}, difficultyScores: {},
        topicScores: {}, streakDays: 0,
        weakTopics: [], strongTopics: [],
        recentTrend: 'neutral', improvementRate: 0
      };
    }

    const totalTests = testHistory.length;
    let totalCorrect = 0, totalQuestions = 0, bestScore = 0;
    const categoryData = {};
    const difficultyData = {};
    const topicData = {};

    testHistory.forEach(test => {
      const pct = Math.round((test.score / test.total) * 100);
      if (pct > bestScore) bestScore = pct;
      totalCorrect += test.score;
      totalQuestions += test.total;

      // Category breakdown
      if (test.answers) {
        test.answers.forEach(ans => {
          const q = QUESTIONS.find(x => x.id === ans.questionId);
          if (!q) return;
          // Category
          if (!categoryData[q.category]) categoryData[q.category] = { correct: 0, total: 0 };
          categoryData[q.category].total++;
          if (ans.correct) categoryData[q.category].correct++;
          // Topic
          if (!topicData[q.topic]) topicData[q.topic] = { correct: 0, total: 0, category: q.category };
          topicData[q.topic].total++;
          if (ans.correct) topicData[q.topic].correct++;
        });
      }

      // Difficulty
      if (!difficultyData[test.difficulty]) difficultyData[test.difficulty] = { correct: 0, total: 0, tests: 0 };
      difficultyData[test.difficulty].total += test.total;
      difficultyData[test.difficulty].correct += test.score;
      difficultyData[test.difficulty].tests++;
    });

    const avgScore = Math.round((totalCorrect / totalQuestions) * 100);

    // Category scores as percentages
    const categoryScores = {};
    Object.keys(categoryData).forEach(cat => {
      categoryScores[cat] = Math.round((categoryData[cat].correct / categoryData[cat].total) * 100);
    });

    // Difficulty scores
    const difficultyScores = {};
    Object.keys(difficultyData).forEach(diff => {
      difficultyScores[diff] = Math.round((difficultyData[diff].correct / difficultyData[diff].total) * 100);
    });

    // Topic scores
    const topicScores = {};
    Object.keys(topicData).forEach(topic => {
      topicScores[topic] = {
        pct: Math.round((topicData[topic].correct / topicData[topic].total) * 100),
        total: topicData[topic].total,
        correct: topicData[topic].correct,
        category: topicData[topic].category
      };
    });

    // Weak topics (< 50% accuracy, at least 2 questions attempted)
    const weakTopics = Object.entries(topicScores)
      .filter(([_, data]) => data.pct < 50 && data.total >= 2)
      .sort((a, b) => a[1].pct - b[1].pct)
      .slice(0, 5)
      .map(([name, data]) => ({ name, ...data }));

    // Strong topics (> 75% accuracy, at least 2 questions attempted)
    const strongTopics = Object.entries(topicScores)
      .filter(([_, data]) => data.pct > 75 && data.total >= 2)
      .sort((a, b) => b[1].pct - a[1].pct)
      .slice(0, 5)
      .map(([name, data]) => ({ name, ...data }));

    // Streak
    const streakDays = this.calculateStreak(testHistory);

    // Recent trend
    let recentTrend = 'neutral';
    let improvementRate = 0;
    if (testHistory.length >= 3) {
      const recent = testHistory.slice(-3);
      const older = testHistory.slice(-6, -3);
      if (older.length > 0) {
        const recentAvg = recent.reduce((s, t) => s + (t.score / t.total) * 100, 0) / recent.length;
        const olderAvg = older.reduce((s, t) => s + (t.score / t.total) * 100, 0) / older.length;
        improvementRate = Math.round(recentAvg - olderAvg);
        recentTrend = improvementRate > 2 ? 'improving' : improvementRate < -2 ? 'declining' : 'stable';
      }
    }

    return {
      totalTests, avgScore, bestScore, totalQuestions, correctAnswers: totalCorrect,
      categoryScores, difficultyScores, topicScores,
      streakDays, weakTopics, strongTopics, recentTrend, improvementRate
    };
  },

  calculateStreak(testHistory) {
    if (testHistory.length === 0) return 0;
    const dates = [...new Set(testHistory.map(t => new Date(t.date).toDateString()))].sort((a, b) => new Date(b) - new Date(a));
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < dates.length; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      if (dates.includes(checkDate.toDateString())) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  },

  // ============================================
  //  CHART RENDERING — CANVAS
  // ============================================

  // ---- Score Trend Line Chart ----
  drawLineChart(canvasId, testHistory) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);

    if (!testHistory || testHistory.length < 2) {
      this.drawEmptyChart(ctx, W, H, 'Take at least 2 tests to see trends');
      return;
    }

    const pad = { top: 20, right: 20, bottom: 40, left: 45 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;

    const data = testHistory.slice(-15).map(t => Math.round((t.score / t.total) * 100));

    // Grid & Y-axis
    ctx.strokeStyle = this.colors.grid;
    ctx.lineWidth = 1;
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = this.colors.gridText;
    ctx.textAlign = 'right';

    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i;
      const val = 100 - (25 * i);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      ctx.fillText(val + '%', pad.left - 8, y + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    const stepX = cW / (data.length - 1);

    // Draw gradient fill
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    gradient.addColorStop(0, 'rgba(99,102,241,0.25)');
    gradient.addColorStop(1, 'rgba(99,102,241,0)');

    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + cH);
    data.forEach((val, i) => {
      const x = pad.left + i * stepX;
      const y = pad.top + cH - (val / 100) * cH;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + (data.length - 1) * stepX, pad.top + cH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = this.colors.indigo;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    data.forEach((val, i) => {
      const x = pad.left + i * stepX;
      const y = pad.top + cH - (val / 100) * cH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw dots
    data.forEach((val, i) => {
      const x = pad.left + i * stepX;
      const y = pad.top + cH - (val / 100) * cH;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0e1a';
      ctx.fill();
      ctx.strokeStyle = this.colors.indigo;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = this.colors.gridText;
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText('T' + (i + 1), x, pad.top + cH + 20);
    });
  },

  // ---- Category Radar / Spider Chart ----
  drawRadarChart(canvasId, categoryScores) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);

    const cats = Object.keys(CATEGORIES);
    const scores = cats.map(c => categoryScores[c] || 0);

    if (scores.every(s => s === 0)) {
      this.drawEmptyChart(ctx, W, H, 'Complete tests to see category analysis');
      return;
    }

    const cx = W / 2, cy = H / 2;
    const radius = Math.min(W, H) / 2 - 40;
    const n = cats.length;
    const angleStep = (Math.PI * 2) / n;
    const startAngle = -Math.PI / 2;

    // Draw concentric rings
    for (let ring = 1; ring <= 4; ring++) {
      const r = (radius / 4) * ring;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = startAngle + i * angleStep;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = this.colors.grid;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw axis lines
    for (let i = 0; i < n; i++) {
      const a = startAngle + i * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
      ctx.strokeStyle = this.colors.grid;
      ctx.stroke();
    }

    // Draw data polygon
    ctx.beginPath();
    scores.forEach((s, i) => {
      const r = (s / 100) * radius;
      const a = startAngle + i * angleStep;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(99,102,241,0.2)';
    ctx.fill();
    ctx.strokeStyle = this.colors.indigo;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw dots and labels
    ctx.font = '12px Inter, sans-serif';
    scores.forEach((s, i) => {
      const a = startAngle + i * angleStep;
      // Data dot
      const r = (s / 100) * radius;
      const dx = cx + r * Math.cos(a);
      const dy = cy + r * Math.sin(a);
      ctx.beginPath();
      ctx.arc(dx, dy, 4, 0, Math.PI * 2);
      ctx.fillStyle = this.colors.indigo;
      ctx.fill();

      // Label
      const lR = radius + 24;
      const lx = cx + lR * Math.cos(a);
      const ly = cy + lR * Math.sin(a);
      ctx.fillStyle = this.colors.white;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const catName = CATEGORIES[cats[i]].icon + ' ' + s + '%';
      ctx.fillText(catName, lx, ly);
    });
  },

  // ---- Difficulty Bar Chart ----
  drawBarChart(canvasId, difficultyScores) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);

    const diffs = ['easy', 'moderate', 'difficult'];
    const scores = diffs.map(d => difficultyScores[d] || 0);
    const barColors = [this.colors.emerald, this.colors.amber, this.colors.rose];
    const labels = ['Easy', 'Moderate', 'Difficult'];

    if (scores.every(s => s === 0)) {
      this.drawEmptyChart(ctx, W, H, 'Try all difficulty levels to compare');
      return;
    }

    const pad = { top: 20, right: 20, bottom: 40, left: 45 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;

    // Y-axis grid
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = this.colors.gridText;
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i;
      const val = 100 - 25 * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.strokeStyle = this.colors.grid;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillText(val + '%', pad.left - 8, y + 4);
    }

    // Bars
    const barWidth = Math.min(60, cW / (diffs.length * 2));
    const gap = (cW - barWidth * diffs.length) / (diffs.length + 1);

    scores.forEach((s, i) => {
      const x = pad.left + gap + i * (barWidth + gap);
      const barH = (s / 100) * cH;
      const y = pad.top + cH - barH;

      // Bar gradient
      const grad = ctx.createLinearGradient(x, y, x, pad.top + cH);
      grad.addColorStop(0, barColors[i]);
      grad.addColorStop(1, barColors[i] + '40');
      ctx.fillStyle = grad;

      // Rounded top bar
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(x, pad.top + cH);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + barWidth - r, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
      ctx.lineTo(x + barWidth, pad.top + cH);
      ctx.closePath();
      ctx.fill();

      // Value on top
      ctx.fillStyle = this.colors.white;
      ctx.textAlign = 'center';
      ctx.font = '13px Inter, sans-serif';
      ctx.fontWeight = '600';
      ctx.fillText(s + '%', x + barWidth / 2, y - 8);

      // Label
      ctx.fillStyle = this.colors.gridText;
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText(labels[i], x + barWidth / 2, pad.top + cH + 20);
    });
  },

  // ---- Score Donut Chart (for results page) ----
  drawDonutChart(canvasId, score, total, animate = true) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.parentElement.offsetWidth;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2;
    const outerR = size / 2 - 10;
    const innerR = outerR - 16;
    const pct = total > 0 ? score / total : 0;

    const draw = (progress) => {
      ctx.clearRect(0, 0, size, size);

      // Background ring
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.arc(cx, cy, innerR, Math.PI * 2, 0, true);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();

      // Score arc
      const endAngle = -Math.PI / 2 + (Math.PI * 2 * pct * progress);
      const startAngle = -Math.PI / 2;

      if (pct > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, endAngle);
        ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
        ctx.closePath();

        // Color based on score
        let color;
        const scorePct = pct * 100;
        if (scorePct >= 80) color = this.colors.emerald;
        else if (scorePct >= 60) color = this.colors.cyan;
        else if (scorePct >= 40) color = this.colors.amber;
        else color = this.colors.rose;

        const grad = ctx.createLinearGradient(0, 0, size, size);
        grad.addColorStop(0, color);
        grad.addColorStop(1, color + 'cc');
        ctx.fillStyle = grad;
        ctx.fill();
      }
    };

    if (animate) {
      let startTime = null;
      const duration = 1200;
      const easeOut = t => 1 - Math.pow(1 - t, 3);

      const animateFrame = (ts) => {
        if (!startTime) startTime = ts;
        const elapsed = ts - startTime;
        const progress = Math.min(easeOut(elapsed / duration), 1);
        draw(progress);
        if (progress < 1) requestAnimationFrame(animateFrame);
      };
      requestAnimationFrame(animateFrame);
    } else {
      draw(1);
    }
  },

  // ---- Topic Heatmap ----
  drawTopicHeatmap(containerId, topicScores) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const topics = Object.entries(topicScores)
      .sort((a, b) => a[1].pct - b[1].pct);

    if (topics.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Complete tests to see topic analysis</p></div>';
      return;
    }

    topics.forEach(([name, data]) => {
      const item = document.createElement('div');
      item.className = 'topic-heat-item';

      let color, bg;
      if (data.pct >= 80) { color = '#10b981'; bg = 'rgba(16,185,129,0.1)'; }
      else if (data.pct >= 60) { color = '#06b6d4'; bg = 'rgba(6,182,212,0.1)'; }
      else if (data.pct >= 40) { color = '#f59e0b'; bg = 'rgba(245,158,11,0.1)'; }
      else { color = '#ef4444'; bg = 'rgba(239,68,68,0.1)'; }

      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:0.85rem;font-weight:500;">${name}</span>
          <span style="font-size:0.8rem;color:${color};font-weight:600;">${data.pct}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="width:${data.pct}%;background:${color};"></div>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">
          ${data.correct}/${data.total} correct · ${CATEGORIES[data.category]?.name || data.category}
        </div>
      `;
      item.style.padding = '12px';
      item.style.borderRadius = '8px';
      item.style.background = bg;
      item.style.marginBottom = '8px';
      container.appendChild(item);
    });
  },

  // ---- Utility: Empty chart placeholder ----
  drawEmptyChart(ctx, W, H, message) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = this.colors.muted;
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, W / 2, H / 2);
  },

  // ---- Redraw all charts ----
  refreshAllCharts(testHistory) {
    const stats = this.computeStats(testHistory);
    this.drawLineChart('scoreTrendChart', testHistory);
    this.drawRadarChart('categoryRadarChart', stats.categoryScores);
    this.drawBarChart('difficultyBarChart', stats.difficultyScores);
    this.drawTopicHeatmap('topicHeatmap', stats.topicScores);
    return stats;
  }
};

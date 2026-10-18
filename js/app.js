/* =======================================================================
   旅行计划网站 — 数据驱动的单页应用
   数据源：data/itinerary.json
   ======================================================================= */
(function () {
  'use strict';

  var DATA = null;
  var LS_KEY = 'travel-todos-v1';
  var LS_SEED = 'travel-todos-seeded-v1';
  var doneSet = loadDone();

  /* ------------------------- 工具函数 ------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseDate(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  function fmtDate(s) {
    var d = parseDate(s);
    if (!d) return s || '待确认';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function fmtDateShort(s) {
    var d = parseDate(s);
    if (!d) return s || '待确认';
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function fmtDateFull(s) {
    var d = parseDate(s);
    if (!d) return s || '待确认';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function daysFromToday(s) {
    var d = parseDate(s);
    if (!d) return null;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }
  function statusTone(s) {
    if (!s) return 'gray';
    if (/待核实|待确认|待官方确认|候补/.test(s)) return 'amber';
    if (/已购买|已购票|已完成|已预订|已核实|已确认/.test(s)) return 'green';
    if (/待购买|待预订|待预约|待完成/.test(s)) return 'blue';
    if (/不适用|暂未开放/.test(s)) return 'gray';
    return 'gray';
  }
  function statusPill(s) {
    return '<span class="pill pill-' + statusTone(s) + '">' + esc(s || '待确认') + '</span>';
  }
  /* 倒计时胶囊：用于开售日 */
  function countdownPill(saleDate) {
    var n = daysFromToday(saleDate);
    if (n == null) return '';
    if (n === 0) return '<span class="pill pill-red">今日开售</span>';
    if (n > 0) return '<span class="pill ' + (n <= 3 ? 'pill-red' : 'pill-blue') + '">' + n + ' 天后开售</span>';
    return '<span class="pill pill-gray">已开售 ' + (-n) + ' 天</span>';
  }

  /* ------------------------- 地图链接 ------------------------- */
  var MAP = {
    amap: function (name) { return 'https://www.amap.com/search?query=' + encodeURIComponent(name); },
    baidu: function (name) { return 'https://map.baidu.com/search/' + encodeURIComponent(name) + '/@0,0,12'; },
    qq: function (name) { return 'https://map.qq.com/?type=poi&keyword=' + encodeURIComponent(name); },
    amapRoute: function (from, to, mode) {
      var t = (mode === 'car' || mode === 'train' || mode === 'plane') ? 'car' : (mode === 'walk' ? 'walk' : 'bus');
      return 'https://www.amap.com/dir?from%5Bname%5D=' + encodeURIComponent(from) +
             '&to%5Bname%5D=' + encodeURIComponent(to) + '&type=' + t;
    },
    baiduRoute: function (from, to) {
      return 'https://map.baidu.com/dir/?origin=' + encodeURIComponent(from) +
             '&destination=' + encodeURIComponent(to) + '&mode=driving';
    }
  };

  /* ------------------------- 待办本地存储 ------------------------- */
  function loadDone() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveDone() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(doneSet)); } catch (e) {}
  }
  /* 数据里已标记完成的待办，首次加载时自动勾选（之后以用户的实际勾选为准） */
  function seedDoneFromData() {
    var seeded;
    try { seeded = JSON.parse(localStorage.getItem(LS_SEED) || '{}') || {}; }
    catch (e) { seeded = {}; }
    var changed = false;
    DATA.todos.forEach(function (t) {
      if (t.done && !seeded[t.id]) { doneSet[t.id] = true; seeded[t.id] = 1; changed = true; }
    });
    if (changed) {
      saveDone();
      try { localStorage.setItem(LS_SEED, JSON.stringify(seeded)); } catch (e) {}
    }
  }

  /* ------------------------- 购票日历数据构建 ------------------------- */
  function buildTickets() {
    var list = [];
    DATA.transports.forEach(function (t) {
      list.push({
        kind: '交通', cat: '交通',
        title: t.from + ' → ' + t.to + ' 车票',
        sub: (t.fromStation || '') + ' → ' + (t.toStation || '') + '　' + (t.seat || '') +
             (t.price != null ? '　¥' + t.price : ''),
        travelDate: t.date,
        saleDate: t.saleDate,
        saleTime: t.saleTime,
        saleKnown: t.saleTime && t.saleTime !== '待核实',
        needReservation: false,
        status: t.status,
        verifyStatus: t.verifyStatus,
        officialUrl: t.officialUrl,
        extraUrls: t.queryUrl ? [{ label: '12306 车票查询', url: t.queryUrl }] : [],
        reminderDate: t.reminderDate, reminderTime: t.reminderTime,
        note: (t.saleStatus ? t.saleStatus + '。' : '') + (t.saleTimeNote || '') + (t.notes || ''),
        source: t.source
      });
    });
    var seenExtra = {};
    DATA.attractions.forEach(function (a) {
      var isFree = a.ticketPrice && a.ticketPrice.indexOf('免费') === 0;
      list.push({
        kind: isFree ? '景点预约' : '景点门票', cat: '景点门票',
        title: a.name + (isFree ? '（免费预约）' : ' 门票'),
        sub: a.city + '　' + (a.ticketPrice || ''),
        travelDate: a.date,
        earliest: a.earliest || null,
        saleDate: a.bookingOpen && /^\d{4}-\d{2}-\d{2}/.test(a.bookingOpen) ? a.bookingOpen.slice(0, 10) : null,
        saleTime: (function (bo) {
          if (!bo) return '待核实';
          if (/00:10/.test(bo)) return '00:10';
          var m = bo.match(/^(\d{4}-\d{2}-\d{2})[ 　]*(\d{1,2}:\d{2})?/);
          if (m) return m[2] || '起';
          return bo;
        })(a.bookingOpen),
        saleKnown: !!(a.bookingOpen && /^\d{4}-\d{2}-\d{2}/.test(a.bookingOpen)),
        needReservation: !!a.needReservation,
        status: a.status,
        verifyStatus: a.verifyStatus,
        officialUrl: a.officialUrl,
        extraUrls: [],
        reminderDate: a.reminderDate, reminderTime: a.reminderDate ? '09:00' : null,
        note: (a.bookingRule || '') + (a.planPriceNote ? '｜' + a.planPriceNote : '') + (a.reminderNote ? '｜提醒：' + a.reminderNote : ''),
        source: a.source
      });
      (a.extraTransports || []).forEach(function (x) {
        var inc = x.included === true;
        if (seenExtra[x.name]) return; // 同一产品挂在多个景点时只列一次
        seenExtra[x.name] = 1;
        list.push({
          kind: '观光车', cat: '观光车',
          title: a.name + ' · ' + x.name,
          sub: x.price + (inc ? '（已含在门票内）' : '（需单独购买）'),
          travelDate: a.date,
          earliest: x.earliest || null,
          saleDate: null,
          saleTime: inc ? '不适用（含在门票内）' : (x.bookingOpen || '待核实'),
          saleKnown: false,
          needReservation: !inc,
          status: inc ? '不适用' : (a.status === '不适用' ? '不适用' : '待购买'),
          verifyStatus: x.bookingOpen && x.bookingOpen.indexOf('待核实') < 0 ? '规则已核实' : '待官方确认',
          officialUrl: x.officialUrl || a.officialUrl,
          extraUrls: [],
          reminderDate: a.reminderDate, reminderTime: null,
          note: x.booking + (x.operatingHours ? '｜运营时间：' + x.operatingHours : '') + (x.note ? '｜' + x.note : ''),
          source: a.source
        });
      });
    });
    DATA.hotels.forEach(function (h) {
      list.push({
        kind: '酒店预订', cat: '住宿',
        title: h.name,
        sub: h.city + '　入住 ' + fmtDate(h.checkIn) + '　共 ' + h.nights + ' 晚',
        travelDate: h.checkIn,
        saleDate: null,
        saleTime: '随时可预订',
        saleKnown: false,
        needReservation: true,
        status: h.status,
        verifyStatus: h.verifyStatus,
        officialUrl: h.bookingUrl,
        extraUrls: [{ label: '地图定位', url: MAP.amap(h.mapQuery || h.name) }],
        reminderDate: h.checkIn, reminderTime: null,
        note: h.priceNote + (h.note ? '｜' + h.note : ''),
        source: { name: '手写行程计划', url: '', date: DATA.meta.lastVerified }
      });
    });
    list.sort(function (a, b) {
      if (a.saleDate && b.saleDate) return a.saleDate < b.saleDate ? -1 : (a.saleDate > b.saleDate ? 1 : 0);
      if (a.saleDate) return -1;
      if (b.saleDate) return 1;
      return 0;
    });
    return list;
  }

  /* ======================= 渲染：头部 ======================= */
  function renderHeader() {
    $('#siteTitle').textContent = DATA.meta.title;
    $('#siteSubtitle').textContent = DATA.meta.subtitle;

    var d = daysFromToday(DATA.meta.startDate);
    var cd = $('#headerCountdown');
    if (d == null) {
      cd.innerHTML = '<span class="n">—</span><span class="l">待确认</span>';
    } else if (d > 0) {
      cd.innerHTML = '<span class="n">' + d + '</span><span class="l">天后出发</span>';
    } else if (d === 0) {
      cd.innerHTML = '<span class="n">今天</span><span class="l">出发</span>';
    } else {
      cd.innerHTML = '<span class="n">' + (-d) + '</span><span class="l">天前出发</span>';
    }
  }

  /* ======================= 渲染：总览 ======================= */
  function renderOverview() {
    var m = DATA.meta;

    /* ---- Hero ---- */
    var d = daysFromToday(m.startDate);
    var cdN, cdU, cls = '';
    if (d == null) { cdN = '—'; cdU = '待确认'; }
    else if (d > 0) { cdN = d; cdU = '天后出发'; }
    else if (d === 0) { cdN = '今天'; cdU = '出发'; cls = ' today'; }
    else { cdN = (-d); cdU = '天前已出发'; }

    var chain = [m.origin].concat(m.viaCities).concat([m.destination]);
    var chainHtml = chain.map(function (c, i) {
      return (i > 0 ? '<span class="route-arrow"></span>' : '') + '<span class="route-node">' + esc(c) + '</span>';
    }).join('');

    var firstT = DATA.transports[0], lastT = DATA.transports[DATA.transports.length - 1];
    var fullFrom = firstT ? firstT.from : m.origin;
    var fullTo = lastT ? lastT.to : m.destination;

    $('#overviewHero').innerHTML =
      '<div class="hero">' +
        '<svg class="hero-deco" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">' +
          '<path d="M-30 196C50 146 104 210 176 154S300 62 430 108" stroke="#9dbcff" stroke-width="1.4" stroke-dasharray="7 9" stroke-linecap="round"/>' +
          '<path d="M-30 154C64 108 128 180 212 120S324 46 430 82" stroke="#b9aaff" stroke-width="1.2" stroke-dasharray="5 10" stroke-linecap="round" opacity=".75"/>' +
          '<circle cx="86" cy="164" r="3.2" fill="#2f6bff" opacity=".45"/>' +
          '<circle cx="252" cy="120" r="3.2" fill="#6d5ef0" opacity=".4"/>' +
          '<circle cx="364" cy="88" r="3.2" fill="#2f6bff" opacity=".3"/>' +
        '</svg>' +
        '<div class="hero-top">' +
          '<div class="hero-main">' +
            '<div class="hero-count' + cls + '"><span class="n">' + esc(String(cdN)) + '</span><span class="u">' + esc(cdU) + '</span></div>' +
            '<div class="hero-dates"><b>' + esc(fmtDateFull(m.startDate)) + ' — ' + esc(fmtDateFull(m.endDate)) + '</b><i>共 ' + m.totalDays + ' 天</i></div>' +
          '</div>' +
          '<div class="hero-side"><span>起点 / 终点</span><b>' + esc(m.origin) + ' → ' + esc(m.destination) + '</b></div>' +
        '</div>' +
        '<div class="route-chain">' + chainHtml + '</div>' +
        '<div class="hero-actions">' +
          '<a href="' + MAP.amapRoute(fullFrom, fullTo, 'car') + '" target="_blank" rel="noopener">高德 · 全程路线</a>' +
          '<a href="' + MAP.baiduRoute(fullFrom, fullTo) + '" target="_blank" rel="noopener">百度 · 全程路线</a>' +
        '</div>' +
      '</div>';

    /* ---- 需要确认的事项 ---- */
    var cf = $('#overviewConflicts');
    var notices = (DATA.conflicts || []).slice().sort(function (a, b) {
      return (a.level === 'warning' ? 0 : 1) - (b.level === 'warning' ? 0 : 1);
    });
    if (!notices.length) {
      $('#overviewNoticesCard').hidden = true;
    } else {
      $('#overviewNoticesCard').hidden = false;
      var noticeHtml = function (c) {
        return '<div class="notice ' + (c.level === 'warning' ? 'warn' : 'info') + '">' +
          '<div class="nt">' + (c.level === 'warning' ? '⚠️ ' : 'ℹ️ ') + esc(c.title) + '</div>' +
          '<div class="nd">' + esc(c.detail) + '</div>' +
          '<div class="ns"><b>建议：</b>' + esc(c.suggestion) + '</div>' +
        '</div>';
      };
      var warns = notices.filter(function (c) { return c.level === 'warning'; });
      var infos = notices.filter(function (c) { return c.level !== 'warning'; });
      var html = warns.map(noticeHtml).join('');
      if (infos.length) {
        html += '<details class="doc" style="margin-top:' + (warns.length ? '9px' : '0') + '">' +
          '<summary>其他提醒（' + infos.length + ' 条）</summary>' +
          '<div class="doc-body">' + infos.map(noticeHtml).join('') + '</div>' +
        '</details>';
      }
      cf.innerHTML = html;
    }

    /* ---- 关键购票（仅显示还需处理的） ---- */
    var allTickets = buildTickets();
    var tickets = allTickets.filter(function (t) {
      return t.status !== '不适用' && !/已购买|已购票|已预订|已预约/.test(t.status || '');
    });
    var ordered = tickets.slice().sort(function (a, b) {
      var an = a.saleDate ? daysFromToday(a.saleDate) : null;
      var bn = b.saleDate ? daysFromToday(b.saleDate) : null;
      if (an == null && bn == null) return 0;
      if (an == null) return 1;
      if (bn == null) return -1;
      return an - bn;
    });
    var kt = $('#overviewKeyTickets');
    if (!ordered.length) {
      kt.innerHTML = '<p class="card-sub" style="margin:0">票务与住宿都已处理完成 🎉</p>';
    } else {
      kt.innerHTML = ordered.map(function (t) {
        var n = t.saleDate ? daysFromToday(t.saleDate) : null;
        var big, lbl;
        if (n == null) { big = '—'; lbl = '待购买'; }
        else if (n > 0) { big = n; lbl = '天后开售'; }
        else if (n === 0) { big = '今日'; lbl = '开售'; }
        else { big = '已开'; lbl = '售 ' + (-n) + ' 天'; }
        var sub = t.saleDate
          ? (fmtDate(t.saleDate) + ' ' + (t.saleKnown ? t.saleTime : '时刻待核实') + ' · ' + t.status)
          : ((t.travelDate ? fmtDate(t.travelDate) + ' 使用 · ' : '') + t.status);
        return '<div class="tk-mini' + (n != null && n >= 0 && n <= 3 ? ' urgent' : '') + '">' +
          '<div class="when"><div class="n">' + esc(String(big)) + '</div><div class="d">' + esc(lbl) + '</div></div>' +
          '<div class="body">' +
            '<div class="t">' + esc(t.title) + '</div>' +
            '<div class="s">' + esc(sub) + '</div>' +
            (t.earliest ? '<div class="s earliest">最早可约 / 可买：' + esc(t.earliest) + '</div>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    }
    var kc = $('#keyTicketCount');
    if (kc) kc.textContent = tickets.length ? ('待处理 ' + tickets.length + ' 项') : '已全部处理';

    /* ---- 进度 ---- */
    var done = DATA.todos.filter(function (t) { return doneSet[t.id]; }).length;
    var pct = DATA.todos.length ? Math.round(done / DATA.todos.length * 100) : 0;
    var allItems = allTickets.filter(function (t) { return t.status !== '不适用'; });
    var cntDone = allItems.filter(function (t) { return /已购买|已购票|已预订|已完成/.test(t.status || ''); }).length;
    var cntPending = allItems.filter(function (t) { return /待购买|待预订|待预约|待完成|候补/.test(t.status || ''); }).length;
    var statusCounts = '已购 / 已订 ' + cntDone + ' 项 · 待处理 ' + cntPending + ' 项';
    $('#overviewProgress').innerHTML =
      '<div class="bar-lbl"><span>待办完成 ' + done + ' / ' + DATA.todos.length + ' 项</span><span>' + pct + '%</span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<p class="card-sub" style="margin:10px 0 0">购票与预订状态：' + esc(statusCounts) + '</p>';

    /* ---- 数据说明（折叠） ---- */
    $('#overviewDocWrap').innerHTML =
      '<details class="doc">' +
        '<summary>数据说明与来源</summary>' +
        '<div class="doc-body">' +
          '<p><b>年份推断：</b>' + esc(m.yearAssumption) + '</p>' +
          (m.closureCheck ? '<p><b>景点开放状态核查：</b>' + esc(m.closureCheck) + '</p>' : '') +
          '<p><b>天气来源：</b>10/19—10/30 为天气预报（tianqi.com，2026-10-16 查询）；10/31 起超出预报范围，为同期气候参考，出行前请再确认。</p>' +
          '<p><b>预售规则：</b>' + esc(m.presaleRule) + '</p>' +
          '<p><b>数据来源：</b>' + esc(m.sourceNote) + '</p>' +
          '<p style="margin:0;color:var(--muted)">最后核实日期：' + esc(m.lastVerified) + '</p>' +
        '</div>' +
      '</details>';
  }

  /* ======================= 渲染：每日行程 ======================= */
  var activeDay = 'overview';
  function renderDayTabs() {
    var dt = $('#dayTabs'); dt.innerHTML = '';
    var ov = el('button', 'day-tab' + (activeDay === 'overview' ? ' is-active' : ''), '总览');
    ov.addEventListener('click', function () { activeDay = 'overview'; renderDayTabs(); renderDayPanel(); });
    dt.appendChild(ov);
    DATA.days.forEach(function (d) {
      var b = el('button', 'day-tab' + (activeDay === d.id ? ' is-active' : ''),
        '<span class="dt">' + esc(fmtDateShort(d.date)) + '</span><span class="pl">' + esc(dayPlace(d)) + '</span>');
      b.addEventListener('click', function () { activeDay = d.id; renderDayTabs(); renderDayPanel(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      dt.appendChild(b);
    });
  }
  function findTransport(id) { return DATA.transports.filter(function (t) { return t.id === id; })[0]; }
  function findAttraction(id) { return DATA.attractions.filter(function (a) { return a.id === id; })[0]; }
  function findHotel(id) { return DATA.hotels.filter(function (h) { return h.id === id; })[0]; }
  /* 当天所在地（去掉「（出发）」等备注，多城取后一个） */
  function dayPlace(d) {
    return String(d.city || '').replace(/（[^）]*）/g, '').split(' → ').pop().trim();
  }

  function renderDayPanel() {
    var p = $('#dayPanel'); p.innerHTML = '';

    /* 总览：紧凑列表 */
    if (activeDay === 'overview') {
      var card = el('div', 'card');
      card.innerHTML = '<div class="card-hd"><h2><span class="ico ico-violet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg></span>15 天行程一览</h2></div>' +
        DATA.days.map(function (d) {
          return '<div class="day-list-item" data-day="' + d.id + '">' +
            '<div class="idx"><b>' + esc(fmtDateShort(d.date)) + '</b><small>' + esc(dayPlace(d)) + '</small></div>' +
            '<div class="body"><div class="t">' + esc(d.city) + ' · ' + esc(d.theme) + '</div>' +
            '<div class="s">第 ' + d.index + ' 天 · ' + esc(d.weekday) + ' · ' + d.items.length + ' 个节点' +
              (d.weather ? ' · ' + esc(d.weather.cond) + ' ' + esc(d.weather.temp) : '') + '</div></div>' +
            '<div class="chev">›</div>' +
          '</div>';
        }).join('');
      p.appendChild(card);
      $all('.day-list-item', card).forEach(function (row) {
        row.addEventListener('click', function () {
          activeDay = row.getAttribute('data-day'); renderDayTabs(); renderDayPanel();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
      return;
    }

    var day = DATA.days.filter(function (d) { return d.id === activeDay; })[0];
    if (!day) return;

    var card = el('div', 'card');
    var hotelName = (day.hotelId && findHotel(day.hotelId)) ? findHotel(day.hotelId).name : '无（见说明）';
    var head = '<div class="day-head">' +
      '<div class="t">' + esc(fmtDateFull(day.date)) + ' · ' + esc(day.weekday) +
      '<span class="pill pill-gray">第 ' + day.index + ' 天</span></div>' +
      '<div class="c">' + esc(day.city) + ' · ' + esc(day.theme) + '</div>' +
    '</div>' +
    '<div class="day-meta">' +
      '<div><span>起床</span>' + esc(day.wakeUp || '—') + '</div>' +
      '<div><span>早餐</span>' + esc(day.breakfast || '—') + '</div>' +
      '<div><span>退房</span>' + esc(day.checkout || '—') + '</div>' +
      '<div><span>住宿</span>' + esc(hotelName) + '</div>' +
    '</div>';
    if (day.weather || day.advice || day.gear) {
      var br = '<div class="day-brief">';
      if (day.weather) {
        br += '<div class="brief-row">' +
          '<span class="ico ico-blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg></span>' +
          '<div><div class="bl">今日天气<span class="pill pill-gray">' + esc(day.weather.kind || '') + '</span></div>' +
          '<div class="bv"><b>' + esc(day.weather.cond) + '</b>　' + esc(day.weather.temp) + '</div></div>' +
        '</div>';
      }
      if (day.advice) {
        br += '<div class="brief-row">' +
          '<span class="ico ico-violet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg></span>' +
          '<div><div class="bl">出行建议</div><div class="bv">' + esc(day.advice) + '</div></div>' +
        '</div>';
      }
      if (day.gear) {
        br += '<div class="brief-row">' +
          '<span class="ico ico-amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 5.5 5.5 9 8 7.8V21h8V7.8L18.5 9 20 5.5 16 3a4 4 0 0 1-8 0z"/></svg></span>' +
          '<div><div class="bl">穿衣与防护</div><div class="bv">' + esc(day.gear) + '</div></div>' +
        '</div>';
      }
      br += '</div>';
      head += br;
    }
    // 当天提醒（把总览「需要确认的事项」按 dayId 归到当天）
    var dayCf = (DATA.conflicts || []).filter(function (c) { return c.dayId === day.id; });
    if (dayCf.length) {
      head += dayCf.map(function (c) {
        return '<div class="notice ' + (c.level === 'warning' ? 'warn' : 'info') + '" style="margin-top:14px">' +
          '<div class="nt">' + (c.level === 'warning' ? '⚠️ ' : 'ℹ️ ') + esc(c.title) + '</div>' +
          '<div class="nd">' + esc(c.detail) + '</div>' +
          '<div class="ns"><b>建议：</b>' + esc(c.suggestion) + '</div>' +
        '</div>';
      }).join('');
    }
    card.innerHTML = head;

    var tl = el('div', 'timeline');
    day.items.forEach(function (it) {
      var wrap = el('div', 'tl-item t-' + it.type);
      var inner = '<div class="tl-card">' +
        '<div class="tl-top"><span class="tl-time">' + esc(it.time) + '</span>' +
        '<span class="tl-title">' + esc(it.title) + '</span></div>' +
        (it.desc ? '<div class="tl-desc">' + esc(it.desc) + '</div>' : '');
      if (it.ref) {
        var t = findTransport(it.ref), a = findAttraction(it.ref), hh = findHotel(it.ref);
        if (t) {
          inner += '<div class="tl-desc">' + (t.type === '火车' ? '车次 ' : '班次 ') + esc(t.trainNo) + ' · ' + esc(t.seat) + ' · ' + (t.price != null ? '¥' + t.price : '金额待确认') +
                   (t.saleDate ? ' · 开售 ' + esc(fmtDate(t.saleDate)) + ' ' + esc(t.saleTime) : '') + '</div>' +
                   '<div class="tl-links">' +
                   (t.officialUrl ? '<a href="' + esc(t.officialUrl) + '" target="_blank" rel="noopener">' + (t.type === '火车' ? '12306 购票' : '购票 / 查询') + '</a>' : '') +
                   '<a href="' + MAP.amap(t.fromStation) + '" target="_blank" rel="noopener">' + (t.type === '火车' ? '出发站定位' : '上车点定位') + '</a></div>';
        } else if (a) {
          if (a.closure && a.closure.closed) {
            inner += '<div class="tl-desc closure-note">⛔ ' + esc(a.name) + ' 自 ' + esc(a.closure.from) + ' 起' +
                     esc(a.closure.scope) + '暂停对外开放（' + esc(a.closure.reason) + '，' + esc(a.closure.duration) + '）。</div>';
          }
          inner += '<div class="tl-desc">' + esc(a.ticketPrice) + '</div>' +
                   '<div class="tl-links"><a href="' + esc(a.officialUrl) + '" target="_blank" rel="noopener">官方入口 / 规则来源</a>' +
                   '<a href="' + MAP.amap(a.name) + '" target="_blank" rel="noopener">地图定位</a></div>';
        } else if (hh) {
          inner += '<div class="tl-links"><a href="' + esc(hh.bookingUrl) + '" target="_blank" rel="noopener">预订平台</a>' +
                   '<a href="' + MAP.amap(hh.mapQuery || hh.name) + '" target="_blank" rel="noopener">地图定位</a></div>';
        }
      }
      inner += '</div>';
      wrap.innerHTML = inner;
      tl.appendChild(wrap);
    });
    card.appendChild(tl);

    // 当天路线导航（并入当天页面，不再单独占一个板块）
    if (day.mapRoute) {
      card.appendChild(el('p', 'tl-desc', '路线：' + esc(day.mapRoute.label)));
      var ra = el('div', 'map-actions');
      ra.style.marginTop = '10px';
      ra.innerHTML =
        '<a href="' + MAP.amapRoute(day.mapRoute.from, day.mapRoute.to, day.mapRoute.mode) + '" target="_blank" rel="noopener">高德导航</a>' +
        '<a href="' + MAP.baiduRoute(day.mapRoute.from, day.mapRoute.to) + '" target="_blank" rel="noopener">百度导航</a>';
      card.appendChild(ra);
    }
    p.appendChild(card);

    /* 当天票务与住宿：把购票页 / 住宿页里属于这一天的事合并过来 */
    var dayTk = [];
    (day.transportIds || []).forEach(function (id) {
      var t = findTransport(id); if (!t) return;
      dayTk.push('<div class="day-item">' +
        '<div class="di-main"><span class="pill pill-gray">交通</span>' +
        '<div class="di-body"><div class="di-t">' + esc(t.fromStation) + ' → ' + esc(t.toStation) + '</div>' +
        '<div class="di-s">' + esc(t.trainNo || '') + ' · ' + esc(t.depTime || '') + (t.arrTime ? '—' + esc(t.arrTime) : '') +
        (t.seat ? ' · ' + esc(t.seat) : '') + (t.price != null ? ' · ¥' + t.price : '') + '</div>' +
        (t.saleDate && !/已购买/.test(t.status || '') ? '<div class="di-earliest">最早 ' + esc(fmtDate(t.saleDate)) + ' ' + esc(t.saleTime || '') + ' 起售</div>' : '') +
        '</div>' +
        statusPill(t.status) + '</div>' +
        '<div class="tk-links">' +
        (t.officialUrl ? '<a href="' + esc(t.officialUrl) + '" target="_blank" rel="noopener">' + (t.type === '火车' ? '12306 购票' : '购票 / 查询') + '</a>' : '') +
        (t.queryUrl ? '<a href="' + esc(t.queryUrl) + '" target="_blank" rel="noopener">车次查询</a>' : '') +
        '<a href="' + MAP.amap(t.fromStation) + '" target="_blank" rel="noopener">' + (t.type === '火车' ? '出发站' : '上车点') + '</a>' +
        '<a href="' + MAP.amap(t.toStation) + '" target="_blank" rel="noopener">' + (t.type === '火车' ? '到达站' : '下车点') + '</a></div>' +
      '</div>');
    });
    (day.attractionIds || []).forEach(function (id) {
      var a = findAttraction(id); if (!a) return;
      var note = '';
      if (a.closure && a.closure.closed) {
        note = '<div class="closure-note">⛔ 自 ' + esc(a.closure.from) + ' 起' + esc(a.closure.scope) + '暂停开放（' +
               esc(a.closure.reason) + '，' + esc(a.closure.duration) + '）。</div>';
      }
      dayTk.push('<div class="day-item">' +
        '<div class="di-main"><span class="pill pill-violet">景点</span>' +
        '<div class="di-body"><div class="di-t">' + esc(a.name) + '</div>' +
        '<div class="di-s">' + esc(a.ticketPrice || '') + '</div>' +
        (a.earliest && !/已购买|已预约|不适用/.test(a.status || '') ? '<div class="di-earliest">最早可约 / 可买：' + esc(a.earliest) + '</div>' : '') +
        '</div>' +
        statusPill(a.status) + '</div>' + note +
        '<div class="tk-links"><a href="' + esc(a.officialUrl) + '" target="_blank" rel="noopener">官方入口</a>' +
        '<a href="' + MAP.amap(a.name) + '" target="_blank" rel="noopener">地图定位</a></div>' +
      '</div>');
    });
    var dh = day.hotelId ? findHotel(day.hotelId) : null;
    if (dh) {
      dayTk.push('<div class="day-item">' +
        '<div class="di-main"><span class="pill pill-gray">住宿</span>' +
        '<div class="di-body"><div class="di-t">' + esc(dh.name) + '</div>' +
        '<div class="di-s">' + esc(fmtDate(dh.checkIn)) + ' → ' + esc(fmtDate(dh.checkOut)) + ' · ' + dh.nights + ' 晚 · ' +
        (dh.price != null ? '¥' + dh.price : '价格待确认') + '</div></div>' +
        statusPill(dh.status) + '</div>' +
        '<div class="tk-links"><a href="' + esc(dh.bookingUrl) + '" target="_blank" rel="noopener">预订平台</a>' +
        '<a href="' + MAP.amap(dh.mapQuery || dh.name) + '" target="_blank" rel="noopener">高德</a>' +
        '<a href="' + MAP.baidu(dh.mapQuery || dh.name) + '" target="_blank" rel="noopener">百度</a></div>' +
      '</div>');
    }
    if (dayTk.length) {
      p.appendChild(el('div', 'card',
        '<div class="card-hd"><h2><span class="ico ico-amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.6a2.4 2.4 0 0 0 0 4.8V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3.6a2.4 2.4 0 0 0 0-4.8z"/></svg></span>当天票务与住宿</h2></div>' +
        dayTk.join('')));
    }

    /* 当地美食推荐（按当天所在地匹配；过渡日回退到当天经过的城市） */
    var foodList = DATA.foods || [];
    var food = foodList.filter(function (f) { return f.city === dayPlace(day); })[0];
    if (!food) {
      String(day.city || '').replace(/（[^）]*）/g, '').split(' → ').forEach(function (c) {
        if (food) return;
        food = foodList.filter(function (f) { return f.city === c.trim(); })[0];
      });
    }
    if (food) {
      var fh = '<div class="card-hd"><h2><span class="ico ico-orange">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M9.5 7.2c0-1.2 1.3-1.8 1.3-3M14.5 7.2c0-1.2 1.3-1.8 1.3-3"/></svg>' +
        '</span>当地美食推荐 · ' + esc(food.city) + '</h2></div>';
      if (food.note) fh += '<p class="card-sub">' + esc(food.note) + '</p>';
      if (food.markets) fh += '<p class="food-markets">逛吃地点：' + esc(food.markets) + '</p>';
      fh += '<div class="food-list">' + food.items.map(function (it) {
        return '<div class="food-item">' +
          '<div class="fi-hd"><span class="fi-n">' + esc(it.name) + '</span>' +
          '<span class="fi-k">' + esc(it.kind) + '</span>' +
          '<span class="fi-p">' + esc(it.price) + '</span></div>' +
          '<div class="fi-d">' + esc(it.desc) + '</div>' +
          (it.where ? '<div class="fi-w">📍 ' + esc(it.where) + '</div>' : '') +
          (it.solo ? '<div class="fi-s">👤 ' + esc(it.solo) + '</div>' : '') +
        '</div>';
      }).join('') + '</div>';
      p.appendChild(el('div', 'card', fh));
    }

    // 当天待办
    var td = DATA.todos.filter(function (t) { return t.dayId === day.id; });
    if (td.length) {
      var tdc = el('div', 'card', '<div class="card-hd"><h2><span class="ico ico-rose"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l2.5 2.5L20 5"/><path d="M20 12.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg></span>当天待办</h2></div>');
      td.forEach(function (t) {
        var d = el('div', 'todo' + (doneSet[t.id] ? ' done' : ''));
        d.innerHTML = '<input type="checkbox"' + (doneSet[t.id] ? ' checked' : '') + '>' +
          '<div class="body"><div class="ti">' + esc(t.title) + '</div>' +
          '<div class="meta"><span class="pill pill-blue">' + esc(t.category) + '</span><span>' + esc(t.due) + '</span></div></div>';
        $('input', d).addEventListener('change', function (e) {
          if (e.target.checked) doneSet[t.id] = true; else delete doneSet[t.id];
          saveDone(); d.className = 'todo' + (e.target.checked ? ' done' : '');
          renderHeader(); renderTodoProgress(); renderOverview();
        });
        tdc.appendChild(d);
      });
      p.appendChild(tdc);
    }

    // 上下一天
    var nav = el('div', 'card');
    var row = el('div', 'map-actions');
    if (day.index > 1) {
      var pd = DATA.days[day.index - 2];
      var prev = el('button', 'btn btn-ghost', '← ' + esc(fmtDateShort(pd.date)));
      prev.addEventListener('click', function () { activeDay = 'day' + (day.index - 1); renderDayTabs(); renderDayPanel(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      row.appendChild(prev);
    }
    var allBtn = el('button', 'btn btn-ghost', '行程一览');
    allBtn.addEventListener('click', function () { activeDay = 'overview'; renderDayTabs(); renderDayPanel(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    row.appendChild(allBtn);
    if (day.index < DATA.meta.totalDays) {
      var nd = DATA.days[day.index];
      var next = el('button', 'btn btn-ghost', esc(fmtDateShort(nd.date)) + ' →');
      next.addEventListener('click', function () { activeDay = 'day' + (day.index + 1); renderDayTabs(); renderDayPanel(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      row.appendChild(next);
    }
    nav.appendChild(row);
    p.appendChild(nav);
  }

  /* ======================= 渲染：全部地点定位（并入总览） ======================= */
  function renderPlaces() {
    var mp = $('#overviewPlaces'); if (!mp) return;
    mp.innerHTML = '';
    var places = [];
    DATA.hotels.forEach(function (h) { places.push({ n: h.name, s: h.city + ' · 酒店', q: h.mapQuery || h.name }); });
    DATA.attractions.forEach(function (a) { places.push({ n: a.name, s: a.city + ' · 景点', q: a.name }); });
    DATA.transports.forEach(function (t) {
      places.push({ n: t.fromStation, s: t.from + ' · 车站', q: t.fromStation });
      places.push({ n: t.toStation, s: t.to + ' · 车站', q: t.toStation });
    });
    var seen = {};
    places.forEach(function (pl) {
      if (seen[pl.q]) return; seen[pl.q] = 1;
      mp.appendChild(el('div', 'map-list-item',
        '<div><div class="n">' + esc(pl.n) + '</div><div class="s">' + esc(pl.s) + '</div></div>' +
        '<div class="map-actions">' +
          '<a href="' + MAP.amap(pl.q) + '" target="_blank" rel="noopener">高德</a>' +
          '<a href="' + MAP.baidu(pl.q) + '" target="_blank" rel="noopener">百度</a>' +
          '<a href="' + MAP.qq(pl.q) + '" target="_blank" rel="noopener">腾讯</a>' +
        '</div>'));
    });
  }

  /* ======================= 渲染：购票与住宿 ======================= */
  var ticketFilter = '全部';
  function renderTicketFilters() {
    var cats = ['全部', '交通', '景点门票', '观光车', '待确认', '已购买'];
    var f = $('#ticketFilters'); f.innerHTML = '';
    cats.forEach(function (c) {
      var b = el('button', 'chip' + (ticketFilter === c ? ' is-active' : ''), esc(c));
      b.addEventListener('click', function () { ticketFilter = c; renderTicketFilters(); renderTicketList(); });
      f.appendChild(b);
    });
  }
  /* 紧凑核实状态标签 */
  function verifyPill(v) {
    if (!v) return '';
    if (/待核实|待确认|待官方确认/.test(v)) return '<span class="pill pill-amber">待核实</span>';
    if (/已核实|已确认/.test(v)) return '<span class="pill pill-green">已核实</span>';
    return '<span class="pill pill-gray">' + esc(v) + '</span>';
  }
  function ticketCardHtml(t) {
    var n = daysFromToday(t.saleDate);
    var cls = 'tk';
    if (n != null && n >= 0 && n <= 3 && !/已购买/.test(t.status)) cls += ' urgent';
    else if (n != null && n > 3 && n <= 7 && !/已购买/.test(t.status)) cls += ' soon';

    var saleTxt = t.saleDate
      ? esc(fmtDate(t.saleDate)) + '　' + (t.saleKnown ? esc(t.saleTime) : '<span class="pill pill-amber">时刻待核实</span>')
      : '<span class="pill pill-amber">待核实</span>';

    var links = '';
    if (t.officialUrl) links += '<a href="' + esc(t.officialUrl) + '" target="_blank" rel="noopener">官方购票 / 预约入口</a>';
    (t.extraUrls || []).forEach(function (u) { links += '<a href="' + esc(u.url) + '" target="_blank" rel="noopener">' + esc(u.label) + '</a>'; });
    if (t.source && t.source.url) links += '<a href="' + esc(t.source.url) + '" target="_blank" rel="noopener">来源 / 公告</a>';

    var docBody = esc(t.note || '（无补充说明）');
    if (t.source) docBody += '<br>来源：' + esc(t.source.name) + '（核实日期 ' + esc(t.source.date) + '）';

    return '<div class="' + cls + '">' +
      '<div class="tk-top">' +
        '<div><div class="tk-title">' + esc(t.title) + '</div>' +
        '<div class="tk-sub">' + esc(t.sub) + '</div></div>' +
        statusPill(t.status) +
      '</div>' +
      '<div class="tk-when">' +
        '<span><span class="k">开售</span> <span class="v">' + saleTxt + '</span></span>' +
        '<span><span class="k">乘车 / 游览</span> <span class="v">' + esc(fmtDate(t.travelDate)) + '</span></span>' +
        '<span><span class="k">需预约</span> <span class="v">' + (t.needReservation ? '是' : '否') + '</span></span>' +
        '<span><span class="k">核实</span> <span class="v">' + verifyPill(t.verifyStatus) + '</span></span>' +
        countdownPill(t.saleDate) +
      '</div>' +
      (links ? '<div class="tk-links">' + links + '</div>' : '') +
      '<details class="doc"><summary>备注与来源</summary><div class="doc-body">' + docBody + '</div></details>' +
    '</div>';
  }
  function renderTicketList() {
    var list = buildTickets().filter(function (t) { return t.cat !== '住宿'; });
    if (ticketFilter === '待确认') list = list.filter(function (t) { return /待核实|待确认|待官方确认/.test(t.verifyStatus || '') || /待核实|待确认/.test(t.saleTime || ''); });
    else if (ticketFilter === '已购买') list = list.filter(function (t) { return /已购买/.test(t.status || ''); });
    else if (ticketFilter !== '全部') list = list.filter(function (t) { return t.cat === ticketFilter; });

    var box = $('#ticketList'); box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<p class="card-sub" style="margin:0">当前筛选条件下没有条目。</p>'; return; }

    // 按紧急度分组
    var groups = [
      { key: 'urgent', title: '3 天内开售 / 需尽快处理', items: [] },
      { key: 'week', title: '7 天内开售', items: [] },
      { key: 'later', title: '更晚开售', items: [] },
      { key: 'opened', title: '已开售（待购买）', items: [] },
      { key: 'unknown', title: '开售时间待核实', items: [] },
      { key: 'done', title: '已完成 / 不适用', items: [] }
    ];
    list.forEach(function (t) {
      var n = daysFromToday(t.saleDate);
      if (/已购买/.test(t.status || '') || t.status === '不适用') { groups[5].items.push(t); return; }
      if (n == null) { groups[4].items.push(t); return; }
      if (n < 0) { groups[3].items.push(t); return; }
      if (n <= 3) { groups[0].items.push(t); return; }
      if (n <= 7) { groups[1].items.push(t); return; }
      groups[2].items.push(t);
    });

    groups.forEach(function (g) {
      if (!g.items.length) return;
      var wrap = el('div', 'tk-group');
      wrap.innerHTML = '<div class="tk-group-title' + (g.key === 'urgent' ? ' urgent' : '') + '">' +
        esc(g.title) + '<span class="cnt">' + g.items.length + '</span></div>' +
        g.items.map(ticketCardHtml).join('');
      box.appendChild(wrap);
    });
  }
  function renderSaleTimeTable() {
    var t = '<table class="sale"><thead><tr><th>车站</th><th>起售时刻</th><th>核实状态</th><th>来源</th></tr></thead><tbody>';
    DATA.stationSaleTimes.forEach(function (s) {
      t += '<tr><td>' + esc(s.station) + '</td><td><b>' + esc(s.time) + '</b></td><td>' + statusPill(s.verifyStatus) + '</td><td class="muted small">' + esc(s.source) + '</td></tr>';
    });
    t += '</tbody></table><p class="card-sub" style="margin-top:10px">官方查询入口：' +
      '<a href="https://kyfw.12306.cn/index/view/infos/sale_time.html" target="_blank" rel="noopener">12306 起售时间查询</a> · ' +
      '<a href="https://mobile.12306.cn/weixin/wxcore/ysqcx" target="_blank" rel="noopener">12306 预售期查询</a></p>';
    $('#saleTimeTable').innerHTML = t;
  }

  /* ======================= 渲染：住宿 ======================= */
  function renderHotels() {
    var box = $('#hotelList'); box.innerHTML = '';
    DATA.hotels.forEach(function (h) {
      var card = el('div', 'hotel');
      card.innerHTML =
        '<div class="hotel-top"><div>' +
          '<div class="hotel-name">' + esc(h.name) + '</div>' +
          '<div class="hotel-sub">' + esc(h.city) + ' · ' + esc(fmtDate(h.checkIn)) + ' → ' + esc(fmtDate(h.checkOut)) + ' · ' + h.nights + ' 晚</div>' +
        '</div>' + statusPill(h.status) + '</div>' +
        '<div class="hotel-meta">' +
          '<span><b>价格</b> ' + (h.price != null ? '¥' + h.price : '待确认') + '</span>' +
          '<span><b>入住日期</b> ' + esc(h.nightDates.map(fmtDate).join('、')) + '</span>' +
        '</div>' +
        '<div class="tk-links">' +
          '<a href="' + esc(h.bookingUrl) + '" target="_blank" rel="noopener">预订平台</a>' +
          '<a href="' + MAP.amap(h.mapQuery || h.name) + '" target="_blank" rel="noopener">高德</a>' +
          '<a href="' + MAP.baidu(h.mapQuery || h.name) + '" target="_blank" rel="noopener">百度</a>' +
          '<a href="' + MAP.qq(h.mapQuery || h.name) + '" target="_blank" rel="noopener">腾讯</a>' +
        '</div>' +
        '<details class="doc"><summary>地址与备注</summary><div class="doc-body">' +
          '<p><b>地址：</b>' + esc(h.address) + '</p>' +
          '<p><b>价格说明：</b>' + esc(h.priceNote) + '</p>' +
          '<p style="margin:0"><b>备注：</b>' + esc(h.note) + '</p>' +
        '</div></details>';
      box.appendChild(card);
    });
  }

  /* ======================= 渲染：待办 ======================= */
  var todoFilter = '全部';
  function renderTodoFilters() {
    var cats = ['全部', '交通', '景点门票', '景点预约', '观光车', '酒店预订', '交通衔接', '出行准备'];
    var f = $('#todoFilters'); f.innerHTML = '';
    cats.forEach(function (c) {
      var b = el('button', 'chip' + (todoFilter === c ? ' is-active' : ''), esc(c));
      b.addEventListener('click', function () { todoFilter = c; renderTodoFilters(); renderTodoList(); });
      f.appendChild(b);
    });
  }
  function renderTodoProgress() {
    var done = DATA.todos.filter(function (t) { return doneSet[t.id]; }).length;
    var pct = DATA.todos.length ? Math.round(done / DATA.todos.length * 100) : 0;
    var box = $('#todoProgress');
    if (!box) return;
    box.innerHTML = '<div class="bar-lbl"><span>已完成 ' + done + ' / ' + DATA.todos.length + ' 项</span><span>' + pct + '%</span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>';
  }
  function renderTodoList() {
    var list = DATA.todos.slice();
    if (todoFilter !== '全部') list = list.filter(function (t) { return t.category === todoFilter; });
    var box = $('#todoList'); box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<p class="card-sub" style="margin:0">当前筛选条件下没有待办。</p>'; return; }
    list.forEach(function (t) {
      var day = DATA.days.filter(function (d) { return d.id === t.dayId; })[0];
      var d = el('div', 'todo' + (doneSet[t.id] ? ' done' : ''));
      d.innerHTML = '<input type="checkbox"' + (doneSet[t.id] ? ' checked' : '') + ' aria-label="' + esc(t.title) + '">' +
        '<div class="body"><div class="ti">' + esc(t.title) + '</div>' +
        '<div class="meta"><span class="pill pill-blue">' + esc(t.category) + '</span>' +
        '<span>' + esc(t.due) + '</span>' +
        (day ? '<span>' + esc(fmtDate(day.date)) + ' ' + esc(day.city) + '</span>' : '') + '</div></div>';
      $('input', d).addEventListener('change', function (e) {
        if (e.target.checked) doneSet[t.id] = true; else delete doneSet[t.id];
        saveDone(); d.className = 'todo' + (e.target.checked ? ' done' : '');
        renderTodoProgress(); renderHeader(); renderOverview();
      });
      box.appendChild(d);
    });
  }

  /* ======================= 导出 ======================= */
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function exportJson() {
    download('itinerary.json', JSON.stringify(DATA, null, 2), 'application/json;charset=utf-8');
  }
  function icsEscape(s) { return String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }
  function dtStamp(dateStr, timeStr) {
    var d = parseDate(dateStr); if (!d) return null;
    var hh = '09', mm = '00';
    if (timeStr && /^\d{1,2}:\d{2}$/.test(timeStr)) { var p = timeStr.split(':'); hh = pad(+p[0]); mm = p[1]; }
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + hh + mm + '00';
  }
  function exportIcs() {
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//travel-plan//CN', 'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:' + icsEscape(DATA.meta.title), 'X-WR-TIMEZONE:Asia/Shanghai'
    ];
    var uid = 0;
    function push(summary, dateStr, timeStr, desc, durMin) {
      var dt = dtStamp(dateStr, timeStr); if (!dt) return;
      var d = parseDate(dateStr);
      var hh = +dt.slice(9, 11), mm = +dt.slice(11, 13);
      var e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm + (durMin || 60));
      var end = e.getFullYear() + pad(e.getMonth() + 1) + pad(e.getDate()) + 'T' + pad(e.getHours()) + pad(e.getMinutes()) + '00';
      uid++;
      lines.push('BEGIN:VEVENT',
        'UID:travel-' + uid + '@travel-plan',
        'DTSTAMP:' + dt + 'Z',
        'DTSTART;TZID=Asia/Shanghai:' + dt,
        'DTEND;TZID=Asia/Shanghai:' + end,
        'SUMMARY:' + icsEscape(summary),
        'DESCRIPTION:' + icsEscape(desc),
        'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(summary), 'END:VALARM',
        'END:VEVENT');
    }
    buildTickets().forEach(function (t) {
      if (t.status === '不适用') return;
      if (t.saleDate && t.saleKnown) {
        push('【购票提醒】' + t.title + ' 开售', t.saleDate, t.saleTime,
          '开售时刻：' + t.saleTime + '（北京时间）\n乘车/游览日：' + t.travelDate + '\n官方入口：' + (t.officialUrl || '') + '\n' + (t.note || ''), 30);
      } else if (t.reminderDate) {
        push('【准备】' + t.title, t.reminderDate, t.reminderTime || '09:00',
          '开售时刻待核实，请前往 12306 / 官方渠道确认。\n' + (t.note || ''), 30);
      }
    });
    DATA.transports.forEach(function (t) {
      push('【乘车】' + t.fromStation + ' → ' + t.toStation + ' ' + (t.trainNo || ''), t.date, t.depTime,
        '席别：' + t.seat + '　历时：' + t.duration + '\n状态：' + t.status, 120);
    });
    lines.push('END:VCALENDAR');
    download('travel-reminders.ics', lines.join('\r\n'), 'text/calendar;charset=utf-8');
  }

  /* ======================= 路由 / 初始化 ======================= */
  function showView(name) {
    $all('.view').forEach(function (v) { v.hidden = true; });
    var v = $('#view-' + name); if (v) v.hidden = false;
    $all('.nav-btn').forEach(function (t) { t.classList.toggle('is-active', t.getAttribute('data-view') === name); });
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function initTabs() {
    $all('.nav-btn').forEach(function (b) {
      b.addEventListener('click', function () { showView(b.getAttribute('data-view')); });
    });
    $all('[data-goto]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); showView(a.getAttribute('data-goto')); });
    });
    window.addEventListener('hashchange', function () {
      var n = (location.hash || '#overview').replace('#', '');
      if ($('#view-' + n)) showView(n);
    });
  }

  /* 兼容没有 fetch 的环境（老浏览器 / 部分内置 WebView） */
  function loadData(url) {
    if (typeof window.fetch === 'function') {
      return window.fetch(url, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (e) { reject(new Error('JSON 解析失败：' + e.message)); }
        } else {
          reject(new Error('HTTP ' + xhr.status));
        }
      };
      xhr.onerror = function () { reject(new Error('网络请求失败')); };
      xhr.send();
    });
  }

  function boot() {
    loadData('data/itinerary.json')
      .then(function (json) {
        DATA = json;
        seedDoneFromData();
        $('#loading').classList.add('hidden');
        renderHeader();
        renderOverview();
        activeDay = 'overview';
        renderDayTabs(); renderDayPanel();
        renderPlaces();
        $('#exportJson').addEventListener('click', exportJson);
        $('#exportIcs').addEventListener('click', exportIcs);
        $('#printPage').addEventListener('click', function () { window.print(); });
        $('#resetTodos').addEventListener('click', function () {
          if (confirm('确定清除全部已勾选的待办状态吗？')) { doneSet = {}; saveDone(); renderDayPanel(); renderOverview(); renderHeader(); }
        });
        $('#icsNote').textContent = '说明：本网站是静态页面，无法在关闭后主动推送手机通知。请使用「购票提醒日历（ICS）」导入系统日历，或使用购票日历清单自行设置提醒。';
        initTabs();
        var start = (location.hash || '#overview').replace('#', '');
        showView($('#view-' + start) ? start : 'overview');
      })
      .catch(function (e) {
        $('#loading').classList.add('hidden');
        var box = $('#loadError');
        box.classList.remove('hidden');
        box.innerHTML = '<b>行程数据加载失败</b>（' + esc(e.message) + '）。<br>' +
          '如果你是直接用浏览器打开本地 <code>index.html</code>，浏览器会因安全策略拦截读取 <code>data/itinerary.json</code>。<br>' +
          '请在本目录下启动一个本地服务器后再访问，例如：<br><code>python -m http.server 8080</code>，然后打开 <code>http://localhost:8080/</code>。';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

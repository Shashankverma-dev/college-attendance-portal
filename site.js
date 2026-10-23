(function () {
  'use strict';

  // 1. Image loading and slot revelation
  var images = document.querySelectorAll('img');
  Array.prototype.forEach.call(images, function (img) {
    function show() {
      img.hidden = false;
      var slot = img.closest('.slot');
      if (slot) { slot.classList.add('has-photo'); }
    }
    if (img.complete && img.naturalWidth > 0) {
      show();
    } else {
      img.addEventListener('load', show);
    }
  });

  // 2. Interactive Example Register
  var registerSvg = document.getElementById('interactive-register-svg');
  if (registerSvg) {
    var cells = registerSvg.querySelectorAll('.reg-cell');
    var statConducted = document.getElementById('stat-conducted');
    var statPresent = document.getElementById('stat-present');
    var statAbsent = document.getElementById('stat-absent');
    var statLeave = document.getElementById('stat-leave');
    var statPct = document.getElementById('stat-pct');
    var statThreshold = document.getElementById('stat-threshold');

    var cycle = {
      'p': { next: 'a', href: '#sq-a' },
      'a': { next: 'l', href: '#sq-l' },
      'l': { next: 'p', href: '#sq-p' }
    };

    function recalculate() {
      var p = 0;
      var a = 0;
      var l = 0;

      Array.prototype.forEach.call(cells, function (cell) {
        var state = cell.getAttribute('data-state') || 'p';
        if (state === 'p') p++;
        else if (state === 'a') a++;
        else if (state === 'l') l++;
      });

      var total = cells.length;
      var eligibleConducted = p + a;
      var percentage = eligibleConducted > 0 ? ((p / eligibleConducted) * 100).toFixed(1) : '100.0';

      if (statConducted) statConducted.textContent = total;
      if (statPresent) statPresent.textContent = p;
      if (statAbsent) statAbsent.textContent = a;
      if (statLeave) statLeave.textContent = l;
      if (statPct) statPct.textContent = percentage + '%';

      if (statThreshold) {
        var numPct = parseFloat(percentage);
        if (numPct >= 75.0) {
          statThreshold.className = 'threshold-indicator';
          statThreshold.textContent = 'Meets minimum 75% attendance threshold';
          if (statPct) statPct.style.color = 'var(--ink)';
        } else {
          statThreshold.className = 'threshold-indicator warning';
          statThreshold.textContent = 'Below minimum 75% attendance threshold';
          if (statPct) statPct.style.color = '#FBBF24';
        }
      }
    }

    Array.prototype.forEach.call(cells, function (cell) {
      cell.addEventListener('click', function () {
        var current = cell.getAttribute('data-state') || 'p';
        var nextInfo = cycle[current] || cycle['p'];
        cell.setAttribute('data-state', nextInfo.next);
        cell.setAttribute('href', nextInfo.href);
        recalculate();
      });

      cell.setAttribute('tabindex', '0');
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', 'Toggle session status');
      cell.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          cell.click();
        }
      });
    });

    recalculate();
  }

  // 3. Calendar Filtering
  var filterButtons = document.querySelectorAll('.cal-filter-btn');
  var eventItems = document.querySelectorAll('.event-item');

  Array.prototype.forEach.call(filterButtons, function (btn) {
    btn.addEventListener('click', function () {
      var category = btn.getAttribute('data-filter');

      Array.prototype.forEach.call(filterButtons, function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      Array.prototype.forEach.call(eventItems, function (item) {
        var itemCat = item.getAttribute('data-category');
        if (category === 'all' || itemCat === category) {
          item.style.display = 'grid';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });

  // 4. Mobile Side Navigation Drawer Controller
  var navToggleBtn = document.getElementById('nav-toggle-btn');
  var drawerBackdrop = document.getElementById('mobile-drawer-backdrop');
  var drawer = document.getElementById('mobile-drawer');
  var drawerCloseBtn = document.getElementById('drawer-close-btn');

  function openDrawer() {
    if (drawer) {
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
    }
    if (drawerBackdrop) {
      drawerBackdrop.classList.add('is-open');
    }
    if (navToggleBtn) {
      navToggleBtn.classList.add('is-active');
      navToggleBtn.setAttribute('aria-expanded', 'true');
    }
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    if (drawer) {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (drawerBackdrop) {
      drawerBackdrop.classList.remove('is-open');
    }
    if (navToggleBtn) {
      navToggleBtn.classList.remove('is-active');
      navToggleBtn.setAttribute('aria-expanded', 'false');
    }
    document.body.style.overflow = '';
  }

  function toggleDrawer() {
    if (drawer && drawer.classList.contains('is-open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  window.openNavDrawer = openDrawer;
  window.closeNavDrawer = closeDrawer;
  window.toggleNavDrawer = toggleDrawer;

  if (navToggleBtn) {
    navToggleBtn.addEventListener('click', function (e) {
      e.preventDefault();
      toggleDrawer();
    });
  }

  if (drawerCloseBtn) {
    drawerCloseBtn.addEventListener('click', function (e) {
      e.preventDefault();
      closeDrawer();
    });
  }

  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', function (e) {
      e.preventDefault();
      closeDrawer();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer && drawer.classList.contains('is-open')) {
      closeDrawer();
    }
  });

  if (drawer) {
    var drawerLinks = drawer.querySelectorAll('a');
    Array.prototype.forEach.call(drawerLinks, function (link) {
      link.addEventListener('click', function () {
        closeDrawer();
      });
    });
  }

  // 5. User Avatar Menu & Session Context Controller
  window.toggleUserDropdown = function (e) {
    if (e) {
      if (e.__avatarHandled) return;
      e.__avatarHandled = true;
      e.preventDefault();
      e.stopPropagation();
    }
    var wrap = document.querySelector('.user-menu-wrap');
    var btn = document.querySelector('.user-avatar-btn');
    if (wrap) {
      var isOpen = wrap.classList.toggle('is-open');
      if (btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
  };

  function initUserDropdown() {
    var userMenuWrap = document.querySelector('.user-menu-wrap');
    var userAvatarBtn = document.querySelector('.user-avatar-btn');

    if (userMenuWrap && userAvatarBtn) {
      if (!userAvatarBtn.getAttribute('onclick')) {
        userAvatarBtn.addEventListener('click', window.toggleUserDropdown);
      }

      document.addEventListener('click', function (e) {
        if (!userMenuWrap.contains(e.target)) {
          userMenuWrap.classList.remove('is-open');
          userAvatarBtn.setAttribute('aria-expanded', 'false');
        }
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          userMenuWrap.classList.remove('is-open');
          userAvatarBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }
  initUserDropdown();

  function getNormalizedRole(rawRole) {
    if (!rawRole) return '';
    var r = rawRole.toString().trim().toLowerCase();
    if (r === 'admin' || r === 'global_admin' || r === 'hod') return 'admin';
    if (r === 'faculty' || r === 'teacher') return 'faculty';
    if (r === 'student') return 'student';
    return '';
  }

  // 6. Authoritative Route Guards & Role-Based Navigation Controller
  function enforceRouteGuards() {
    var rawPath = (window.location.pathname || '').toLowerCase();
    var page = rawPath.substring(rawPath.lastIndexOf('/') + 1) || 'index.html';

    var isAdminRoute = page.indexOf('admin') === 0;
    var isFacultyRoute = page.indexOf('teacher') === 0 || page.indexOf('past-registers') === 0;
    var isStudentRoute = page.indexOf('student') === 0;
    var isProfileRoute = page === 'profile.html';

    var rawRole = sessionStorage.getItem('attendance_user_role') || localStorage.getItem('attendance_user_role') || '';
    var activeRole = getNormalizedRole(rawRole);
    var activeId = sessionStorage.getItem('attendance_user_id') || localStorage.getItem('attendance_user_id') || '';

    // 1. Unauthenticated Visitor Protection on Protected Routes
    if (!activeRole || !activeId) {
      if (isAdminRoute || isFacultyRoute || isStudentRoute || isProfileRoute) {
        window.location.replace('signin.html');
        return false;
      }
      return true;
    }

    // 2. Cross-Role Access Control Guards (Prevent Silent Role Degradation & Privilege Escalation)
    if (activeRole === 'admin') {
      if (isStudentRoute || isFacultyRoute) {
        window.location.replace('admin.html');
        return false;
      }
    } else if (activeRole === 'student') {
      if (isAdminRoute || isFacultyRoute) {
        window.location.replace('student.html');
        return false;
      }
    } else if (activeRole === 'faculty') {
      if (isAdminRoute || isStudentRoute) {
        window.location.replace('teacher.html');
        return false;
      }
    }

    return true;
  }

  function syncRoleNavigation() {
    if (!enforceRouteGuards()) {
      return;
    }

    var path = (window.location.pathname || '').toLowerCase();
    var page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

    var rawRole = sessionStorage.getItem('attendance_user_role') || localStorage.getItem('attendance_user_role') || '';
    var activeRole = getNormalizedRole(rawRole);
    var activeId = sessionStorage.getItem('attendance_user_id') || localStorage.getItem('attendance_user_id') || '';

    // Handle Public Documentation Pages (terms.html & privacy.html)
    if (page === 'privacy.html' || page === 'terms.html') {
      var docWordmark = document.querySelector('.site-head .wordmark');
      var docActions = document.querySelector('.site-head .head-actions');
      if (docWordmark && activeRole) {
        docWordmark.href = activeRole === 'admin' ? 'admin.html' : (activeRole === 'faculty' ? 'teacher.html' : 'student.html');
      }
      if (docActions && activeRole) {
        var overviewTarget = activeRole === 'admin' ? 'admin.html' : (activeRole === 'faculty' ? 'teacher.html' : 'student.html');
        var roleLabel = activeRole === 'admin' ? 'Dashboard Overview' : (activeRole === 'faculty' ? 'Teacher Overview' : 'Student Overview');
        docActions.innerHTML = [
          '<a class="btn btn-sm btn-outline" href="' + overviewTarget + '">' + roleLabel + '</a>',
          '<a class="btn btn-sm" href="profile.html">My Profile</a>'
        ].join('');
      }
    }

    // Dynamic Navigation Containers (calendar.html, profile.html, etc.)
    var calNav = document.getElementById('main-head-nav');
    var calActions = document.getElementById('main-head-actions');
    var wordmark = document.getElementById('site-wordmark') || document.querySelector('.site-head .wordmark');
    var drawerWordmark = document.getElementById('drawer-wordmark') || document.querySelector('.mobile-drawer .wordmark');
    var drawerUserInfo = document.getElementById('drawer-user-info-box') || document.querySelector('.mobile-drawer .drawer-user-info');
    var drawerNavLinks = document.getElementById('drawer-nav-links') || document.querySelector('.mobile-drawer .drawer-nav');
    var drawerFooter = document.getElementById('drawer-footer-actions') || document.querySelector('.mobile-drawer .drawer-footer');

    var isCal = page.indexOf('calendar') !== -1;
    var isProf = page.indexOf('profile') !== -1;

    if (calNav && calActions) {
      if (activeRole === 'admin') {
        if (wordmark) wordmark.href = 'admin.html';
        if (drawerWordmark) drawerWordmark.href = 'admin.html';

        calNav.setAttribute('aria-label', 'Administrator navigation');
        calNav.innerHTML = [
          '<a class="nav-link' + (page === 'admin.html' ? ' active' : '') + '" href="admin.html" data-nav="overview" title="Institutional Operations Dashboard">Dashboard</a>',
          '<a class="nav-link' + (page.indexOf('admin-students') !== -1 ? ' active' : '') + '" href="admin-students.html">Students</a>',
          '<a class="nav-link' + (page.indexOf('admin-teachers') !== -1 ? ' active' : '') + '" href="admin-teachers.html">Teacher management</a>',
          '<a class="nav-link' + (page.indexOf('admin-timetable') !== -1 ? ' active' : '') + '" href="admin-timetable.html">Timetable & Academic</a>',
          '<a class="nav-link' + (page.indexOf('admin-marks') !== -1 ? ' active' : '') + '" href="admin-marks.html">Final marks</a>',
          '<a class="nav-link' + (isCal ? ' active' : '') + '" href="calendar.html">Calendar</a>'
        ].join('');

        var _admName = sessionStorage.getItem('attendance_user_name') || activeId;
        var _admInitials = sessionStorage.getItem('attendance_user_initials') || activeId.substring(0,2).toUpperCase();
        var _admRoleTitle = rawRole.toLowerCase() === 'hod' ? 'Head of Department' : 'Global Admin';
        calActions.innerHTML = [
          '<div class="user-menu-wrap" id="user-menu-wrap">',
          '  <button type="button" class="user-avatar-btn" id="user-avatar-btn" onclick="toggleUserDropdown(event)" aria-haspopup="true" aria-expanded="false" aria-label="Open user profile menu">',
          '    <div class="user-avatar-circle" id="display-user-avatar">' + _admInitials + '</div>',
          '    <div class="user-avatar-info">',
          '      <span class="user-avatar-name" id="display-user-name">' + _admName + '</span>',
          '      <span class="user-avatar-role" id="display-user-id">' + _admRoleTitle + '</span>',
          '    </div>',
          '    <svg class="user-avatar-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">',
          '      <polyline points="6 9 12 15 18 9"></polyline>',
          '    </svg>',
          '  </button>',
          '  <div class="user-dropdown-menu" id="user-dropdown-menu" role="menu">',
          '    <div class="user-dropdown-header">',
          '      <strong id="dropdown-user-name">' + _admName + '</strong>',
          '      <span id="dropdown-user-id">ID: ' + activeId + ' \u2022 ' + _admRoleTitle + '</span>',
          '    </div>',
          '    <a class="user-dropdown-item' + (isProf ? ' active' : '') + '" href="profile.html" role="menuitem">',
          '      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
          '      <span>View Profile</span>',
          '    </a>',
          '    <a class="user-dropdown-item" href="admin.html" role="menuitem">',
          '      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
          '      <span>Dashboard Overview</span>',
          '    </a>',
          '    <a class="user-dropdown-item" href="admin-students.html" role="menuitem">',
          '      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>',
          '      <span>Student Management</span>',
          '    </a>',
          '    <a class="user-dropdown-item" href="admin-teachers.html" role="menuitem">',
          '      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
          '      <span>Teacher Management</span>',
          '    </a>',
          '    <a class="user-dropdown-item" href="admin-timetable.html" role="menuitem">',
          '      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
          '      <span>Timetable & Academic</span>',
          '    </a>',
          '    <a class="user-dropdown-item" href="admin-marks.html" role="menuitem">',
          '      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
          '      <span>Final Semester Marks</span>',
          '    </a>',
          '    <div class="user-dropdown-divider"></div>',
          '    <a class="user-dropdown-item danger" href="signin.html" id="signout-btn" onclick="sessionStorage.clear();" role="menuitem">',
          '      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>',
          '      <span>Sign Out</span>',
          '    </a>',
          '  </div>',
          '</div>'
        ].join('');

        if (drawerUserInfo) {
          drawerUserInfo.style.display = 'block';
          drawerUserInfo.innerHTML = '<strong id="drawer-user-name">' + _admName + '</strong><span id="drawer-user-id">ID: ' + activeId + ' (' + _admRoleTitle + ')</span>';
        }
        if (drawerNavLinks) {
          drawerNavLinks.innerHTML = [
            '<a class="drawer-nav-link' + (page === 'admin.html' ? ' active' : '') + '" href="admin.html" onclick="closeNavDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg><span>Dashboard</span></a>',
            '<a class="drawer-nav-link' + (page.indexOf('admin-students') !== -1 ? ' active' : '') + '" href="admin-students.html" onclick="closeNavDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg><span>Student Management</span></a>',
            '<a class="drawer-nav-link' + (page.indexOf('admin-teachers') !== -1 ? ' active' : '') + '" href="admin-teachers.html" onclick="closeNavDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg><span>Teacher Management</span></a>',
            '<a class="drawer-nav-link' + (page.indexOf('admin-timetable') !== -1 ? ' active' : '') + '" href="admin-timetable.html" onclick="closeNavDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg><span>Timetable & Academic</span></a>',
            '<a class="drawer-nav-link' + (page.indexOf('admin-marks') !== -1 ? ' active' : '') + '" href="admin-marks.html" onclick="closeNavDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg><span>Final Semester Marks</span></a>',
            '<a class="drawer-nav-link' + (isCal ? ' active' : '') + '" href="calendar.html" onclick="closeNavDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg><span>Academic Calendar</span></a>',
            '<a class="drawer-nav-link' + (isProf ? ' active' : '') + '" href="profile.html" onclick="closeNavDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><span>Administrator Profile</span></a>'
          ].join('');
        }
        if (drawerFooter) {
          drawerFooter.innerHTML = '<a class="btn btn-sm btn-danger-soft" href="signin.html" id="drawer-signout-btn" style="width: 100%; text-align: center;">Sign Out</a><div class="drawer-meta">SRHU Attendance Management System<br>portal-support@college.edu</div>';
        }

      } else if (activeRole === 'faculty') {
        if (wordmark) wordmark.href = 'teacher.html';
        if (drawerWordmark) drawerWordmark.href = 'teacher.html';

        calNav.setAttribute('aria-label', 'Faculty navigation');
        calNav.innerHTML = [
          '<a class="nav-link' + (page === 'teacher.html' ? ' active' : '') + '" href="teacher.html">Today\'s classes</a>',
          '<a class="nav-link' + (page.indexOf('past-registers') !== -1 ? ' active' : '') + '" href="past-registers.html">Past registers</a>',
          '<a class="nav-link' + (page.indexOf('teacher-marks') !== -1 ? ' active' : '') + '" href="teacher-marks.html">Marks management</a>',
          '<a class="nav-link' + (isCal ? ' active' : '') + '" href="calendar.html">Calendar</a>'
        ].join('');

        var _facName = sessionStorage.getItem('attendance_user_name') || activeId;
        var _facInitials = sessionStorage.getItem('attendance_user_initials') || activeId.substring(0,2).toUpperCase();
        calActions.innerHTML = [
          '<div class="user-menu-wrap" id="user-menu-wrap">',
          '  <button type="button" class="user-avatar-btn" id="user-avatar-btn" onclick="toggleUserDropdown(event)" aria-haspopup="true" aria-expanded="false" aria-label="Open user profile menu">',
          '    <div class="user-avatar-circle" id="display-user-avatar">' + _facInitials + '</div>',
          '    <div class="user-avatar-info">',
          '      <span class="user-avatar-name" id="display-user-name">' + _facName + '</span>',
          '      <span class="user-avatar-role" id="display-user-id">Faculty</span>',
          '    </div>',
          '    <svg class="user-avatar-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>',
          '  </button>',
          '  <div class="user-dropdown-menu" id="user-dropdown-menu" role="menu">',
          '    <div class="user-dropdown-header"><strong id="dropdown-user-name">' + _facName + '</strong><span id="dropdown-user-id">ID: ' + activeId + ' \u2022 Faculty</span></div>',
          '    <a class="user-dropdown-item' + (isProf ? ' active' : '') + '" href="profile.html" role="menuitem">View Profile</a>',
          '    <a class="user-dropdown-item" href="teacher.html" role="menuitem">Today\'s Classes</a>',
          '    <a class="user-dropdown-item" href="past-registers.html" role="menuitem">Past Registers</a>',
          '    <a class="user-dropdown-item" href="teacher-marks.html" role="menuitem">Marks Management</a>',
          '    <div class="user-dropdown-divider"></div>',
          '    <a class="user-dropdown-item danger" href="signin.html" id="signout-btn" onclick="sessionStorage.clear();" role="menuitem">Sign Out</a>',
          '  </div>',
          '</div>'
        ].join('');

        if (drawerUserInfo) {
          drawerUserInfo.style.display = 'block';
          drawerUserInfo.innerHTML = '<strong id="drawer-user-name">' + _facName + '</strong><span id="drawer-user-id">ID: ' + activeId + ' (Faculty)</span>';
        }
        if (drawerNavLinks) {
          drawerNavLinks.innerHTML = [
            '<a class="drawer-nav-link' + (page === 'teacher.html' ? ' active' : '') + '" href="teacher.html" onclick="closeNavDrawer()"><span>Today\'s Classes</span></a>',
            '<a class="drawer-nav-link' + (page.indexOf('past-registers') !== -1 ? ' active' : '') + '" href="past-registers.html" onclick="closeNavDrawer()"><span>Past Registers</span></a>',
            '<a class="drawer-nav-link' + (page.indexOf('teacher-marks') !== -1 ? ' active' : '') + '" href="teacher-marks.html" onclick="closeNavDrawer()"><span>Marks Management</span></a>',
            '<a class="drawer-nav-link' + (isCal ? ' active' : '') + '" href="calendar.html" onclick="closeNavDrawer()"><span>Academic Calendar</span></a>',
            '<a class="drawer-nav-link' + (isProf ? ' active' : '') + '" href="profile.html" onclick="closeNavDrawer()"><span>Faculty Profile</span></a>'
          ].join('');
        }
        if (drawerFooter) {
          drawerFooter.innerHTML = '<a class="btn btn-sm btn-danger-soft" href="signin.html" id="drawer-signout-btn" onclick="sessionStorage.clear();" style="width: 100%; text-align: center;">Sign Out</a><div class="drawer-meta">SRHU Attendance Management System<br>portal-support@college.edu</div>';
        }

      } else if (activeRole === 'student') {
        if (wordmark) wordmark.href = 'student.html';
        if (drawerWordmark) drawerWordmark.href = 'student.html';

        calNav.setAttribute('aria-label', 'Student navigation');
        calNav.innerHTML = [
          '<a class="nav-link' + (page === 'student.html' ? ' active' : '') + '" href="student.html#overview" data-nav="overview">Overview</a>',
          '<a class="nav-link" href="student.html#subjects">Subject breakdown</a>',
          '<a class="nav-link" href="student.html#history">Session history</a>',
          '<a class="nav-link' + (page.indexOf('student-marks') !== -1 ? ' active' : '') + '" href="student-marks.html">Examination marks</a>',
          '<a class="nav-link' + (isCal ? ' active' : '') + '" href="calendar.html">Calendar</a>'
        ].join('');

        var _stuName = sessionStorage.getItem('attendance_user_name') || activeId;
        var _stuInitials = sessionStorage.getItem('attendance_user_initials') || activeId.substring(0,2).toUpperCase();
        calActions.innerHTML = [
          '<div class="user-menu-wrap" id="user-menu-wrap">',
          '  <button type="button" class="user-avatar-btn" id="user-avatar-btn" onclick="toggleUserDropdown(event)" aria-haspopup="true" aria-expanded="false" aria-label="Open user profile menu">',
          '    <div class="user-avatar-circle" id="display-user-avatar">' + _stuInitials + '</div>',
          '    <div class="user-avatar-info">',
          '      <span class="user-avatar-name" id="display-user-name">' + _stuName + '</span>',
          '      <span class="user-avatar-role" id="display-user-id">Student</span>',
          '    </div>',
          '    <svg class="user-avatar-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>',
          '  </button>',
          '  <div class="user-dropdown-menu" id="user-dropdown-menu" role="menu">',
          '    <div class="user-dropdown-header"><strong id="dropdown-user-name">' + _stuName + '</strong><span id="dropdown-user-id">ID: ' + activeId + ' \u2022 Student</span></div>',
          '    <a class="user-dropdown-item' + (isProf ? ' active' : '') + '" href="profile.html" role="menuitem">View Profile</a>',
          '    <a class="user-dropdown-item" href="student.html" role="menuitem">Attendance Dashboard</a>',
          '    <a class="user-dropdown-item" href="student-marks.html" role="menuitem">Examination Marks</a>',
          '    <div class="user-dropdown-divider"></div>',
          '    <a class="user-dropdown-item danger" href="signin.html" id="signout-btn" onclick="sessionStorage.clear();" role="menuitem">Sign Out</a>',
          '  </div>',
          '</div>'
        ].join('');

        if (drawerUserInfo) {
          drawerUserInfo.style.display = 'block';
          drawerUserInfo.innerHTML = '<strong id="drawer-user-name">' + _stuName + '</strong><span id="drawer-user-id">ID: ' + activeId + ' (Student)</span>';
        }
        if (drawerNavLinks) {
          drawerNavLinks.innerHTML = [
            '<a class="drawer-nav-link' + (page === 'student.html' ? ' active' : '') + '" href="student.html#overview" onclick="closeNavDrawer()"><span>Overview</span></a>',
            '<a class="drawer-nav-link" href="student.html#subjects" onclick="closeNavDrawer()"><span>Subject Breakdown</span></a>',
            '<a class="drawer-nav-link" href="student.html#history" onclick="closeNavDrawer()"><span>Session History</span></a>',
            '<a class="drawer-nav-link' + (page.indexOf('student-marks') !== -1 ? ' active' : '') + '" href="student-marks.html" onclick="closeNavDrawer()"><span>Examination Marks</span></a>',
            '<a class="drawer-nav-link' + (isCal ? ' active' : '') + '" href="calendar.html" onclick="closeNavDrawer()"><span>Academic Calendar</span></a>',
            '<a class="drawer-nav-link' + (isProf ? ' active' : '') + '" href="profile.html" onclick="closeNavDrawer()"><span>Student Profile</span></a>'
          ].join('');
        }
        if (drawerFooter) {
          drawerFooter.innerHTML = '<a class="btn btn-sm btn-danger-soft" href="signin.html" id="drawer-signout-btn" onclick="sessionStorage.clear();" style="width: 100%; text-align: center;">Sign Out</a><div class="drawer-meta">SRHU Attendance Management System<br>portal-support@college.edu</div>';
        }

      } else {
        // Unauthenticated visitor / public
        if (wordmark) wordmark.href = 'index.html';
        if (drawerWordmark) drawerWordmark.href = 'index.html';

        calNav.setAttribute('aria-label', 'Public navigation');
        calNav.innerHTML = [
          '<a class="nav-link' + (page === 'index.html' ? ' active' : '') + '" href="index.html">Home</a>',
          '<a class="nav-link" href="signin.html">Student portal</a>',
          '<a class="nav-link" href="signin.html">Teacher portal</a>',
          '<a class="nav-link' + (isCal ? ' active' : '') + '" href="calendar.html">Calendar</a>'
        ].join('');

        calActions.innerHTML = '<a class="btn btn-sm" href="signin.html">Sign in</a>';

        if (drawerUserInfo) {
          drawerUserInfo.style.display = 'none';
        }
        if (drawerNavLinks) {
          drawerNavLinks.innerHTML = [
            '<a class="drawer-nav-link' + (page === 'index.html' ? ' active' : '') + '" href="index.html" onclick="closeNavDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg><span>Home Overview</span></a>',
            '<a class="drawer-nav-link" href="signin.html" onclick="closeNavDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><span>Student Portal</span></a>',
            '<a class="drawer-nav-link" href="signin.html" onclick="closeNavDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg><span>Teacher Portal</span></a>',
            '<a class="drawer-nav-link' + (isCal ? ' active' : '') + '" href="calendar.html" onclick="closeNavDrawer()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg><span>Academic Calendar</span></a>'
          ].join('');
        }
        if (drawerFooter) {
          drawerFooter.innerHTML = '<a class="btn btn-sm btn-ink" href="signin.html">Sign In to Portal</a><div class="drawer-meta">SRHU Attendance Management System<br>portal-support@college.edu</div>';
        }
      }

      initUserDropdown();
    }

    // Bind universal signout event listener to clear session
    var signoutBtns = document.querySelectorAll('#signout-btn, #drawer-signout-btn, .signout-action, a.user-dropdown-item.danger[href*="signin.html"], button.user-dropdown-item.danger');
    Array.prototype.forEach.call(signoutBtns, function (btn) {
      btn.addEventListener('click', function () {
        sessionStorage.removeItem('attendance_user_role');
        sessionStorage.removeItem('attendance_user_id');
        sessionStorage.removeItem('attendance_auth_token');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('attendance_user_name');
        sessionStorage.removeItem('attendance_user_initials');
        sessionStorage.removeItem('attendance_session_id');
        localStorage.removeItem('attendance_user_role');
        localStorage.removeItem('attendance_user_id');
        localStorage.removeItem('attendance_auth_token');
        localStorage.removeItem('token');
      });
    });

    // Global Click Interceptor for Role-Safe Overview Navigation
    document.addEventListener('click', function (e) {
      var target = e.target.closest('a');
      if (!target) return;

      var href = target.getAttribute('href') || '';
      var isOverviewTrigger = target.getAttribute('data-nav') === 'overview' || target.textContent.trim().toLowerCase() === 'overview';

      if (activeRole === 'admin' && isOverviewTrigger) {
        if (page !== 'admin.html') {
          e.preventDefault();
          window.location.href = 'admin.html';
        }
      } else if (activeRole === 'student' && isOverviewTrigger) {
        if (page !== 'student.html') {
          e.preventDefault();
          window.location.href = 'student.html#overview';
        }
      }
    });

    // Sync static avatar on pages that already have display-user-name
    if (activeRole) {
      var nameEl = document.getElementById('display-user-name');
      var idEl = document.getElementById('display-user-id');
      var circleEl = document.getElementById('display-user-avatar');
      var dropdownNameEl = document.getElementById('dropdown-user-name');
      var dropdownIdEl = document.getElementById('dropdown-user-id');
      var drawerNameEl = document.getElementById('drawer-user-name');
      var drawerIdEl = document.getElementById('drawer-user-id');

      // Read real name from sessionStorage (set during sign-in via /api/auth/profile-by-id)
      var cachedName = sessionStorage.getItem('attendance_user_name') || '';
      var cachedInitials = sessionStorage.getItem('attendance_user_initials') || '';
      var displayId = activeId || '';

      // Determine accurate role label
      var upperRaw = (rawRole || '').toString().trim().toUpperCase();
      var roleLabel = 'Student';
      if (activeRole === 'admin') {
        roleLabel = (upperRaw === 'HOD') ? 'Head of Department' : 'Global Admin';
      } else if (activeRole === 'faculty') {
        roleLabel = 'Faculty';
      }

      // If no cached name, fall back to showing the ID itself (will update on next sign-in)
      var displayName = cachedName || displayId;
      var displayInitials = cachedInitials || (displayId.substring(0, 2).toUpperCase());

      if (nameEl) nameEl.textContent = displayName;
      if (idEl) idEl.textContent = roleLabel;
      if (circleEl) circleEl.textContent = displayInitials;
      if (dropdownNameEl) dropdownNameEl.textContent = displayName;
      if (dropdownIdEl) dropdownIdEl.textContent = 'ID: ' + displayId + ' \u2022 ' + roleLabel;
      if (drawerNameEl) drawerNameEl.textContent = displayName;
      if (drawerIdEl) drawerIdEl.textContent = 'ID: ' + displayId + ' (' + roleLabel + ')';
    }
  }

  // Default Render Web Service URL (Can be changed via UI widget or localStorage)
  window.DEFAULT_RENDER_URL = window.DEFAULT_RENDER_URL || 'https://attendance-backend.onrender.com';

  window.getApiBase = function () {
    if (window._apiBase !== undefined && window._apiBase !== null) return window._apiBase;
    var custom = localStorage.getItem('attendance_api_url') || window.APP_API_URL;
    if (custom) {
      window._apiBase = custom.replace(/\/$/, '');
      return window._apiBase;
    }
    var h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
      window._apiBase = 'http://localhost:8080';
    } else {
      // In production on Firebase Hosting, connect to Render backend
      window._apiBase = (window.DEFAULT_RENDER_URL || '').replace(/\/$/, '');
    }
    return window._apiBase;
  };

  window.setApiBase = function (url) {
    if (!url) {
      localStorage.removeItem('attendance_api_url');
      window._apiBase = null;
    } else {
      var clean = url.trim().replace(/\/$/, '');
      localStorage.setItem('attendance_api_url', clean);
      window._apiBase = clean;
    }
    if (typeof window.checkBackendHealth === 'function') {
      window.checkBackendHealth();
    }
    return window.getApiBase();
  };

  window.getApiUrl = function (path) {
    var base = window.getApiBase();
    var p = path.startsWith('/') ? path : '/' + path;
    return (base ? base : '') + p;
  };

  // Render Backend Status & Configuration Widget
  function initRenderStatusWidget() {
    // Only mount widget once DOM is ready
    var widgetId = 'render-status-indicator';
    if (document.getElementById(widgetId)) return;

    var container = document.createElement('div');
    container.id = widgetId;
    container.style.cssText =
      'position:fixed;bottom:16px;right:16px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:12px;transition:all 0.3s ease;';
    
    var pill = document.createElement('div');
    pill.id = 'render-status-pill';
    pill.style.cssText =
      'display:inline-flex;align-items:center;gap:8px;padding:6px 12px;background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:9999px;box-shadow:0 4px 12px rgba(0,0,0,0.15);cursor:pointer;user-select:none;';
    pill.innerHTML =
      '<span id="render-dot" style="width:8px;height:8px;border-radius:50%;background:#eab308;display:inline-block;"></span>' +
      '<span id="render-msg" style="font-weight:500;">Checking Backend...</span>';

    pill.title = 'Click to configure or view backend URL';
    pill.addEventListener('click', function () {
      openBackendModal();
    });

    container.appendChild(pill);
    document.body.appendChild(container);

    window.checkBackendHealth = function () {
      var dot = document.getElementById('render-dot');
      var msg = document.getElementById('render-msg');
      if (!dot || !msg) return;

      var base = window.getApiBase();
      if (!base) {
        dot.style.background = '#ef4444';
        msg.textContent = 'Backend: Unconfigured';
        return;
      }

      msg.textContent = 'Connecting...';
      dot.style.background = '#eab308';

      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timeout = setTimeout(function () {
        if (controller) controller.abort();
      }, 7000);

      fetch(base + '/health', { signal: controller ? controller.signal : undefined })
        .then(function (res) {
          clearTimeout(timeout);
          return res.json();
        })
        .then(function (data) {
          if (data && data.status === 'HEALTHY') {
            dot.style.background = '#22c55e';
            msg.textContent = 'Backend Online';
            // Auto-minimize after 4 seconds to avoid distraction
            setTimeout(function () {
              if (msg && dot && msg.textContent === 'Backend Online') {
                msg.textContent = 'Render';
              }
            }, 4000);
          } else {
            throw new Error('Unexpected status');
          }
        })
        .catch(function () {
          clearTimeout(timeout);
          dot.style.background = '#f59e0b';
          msg.textContent = 'Backend Waking Up...';
          // Retry every 8 seconds if waking up from Render free tier sleep
          setTimeout(function () {
            if (document.getElementById(widgetId)) {
              window.checkBackendHealth();
            }
          }, 8000);
        });
    };

    function openBackendModal() {
      var currentUrl = localStorage.getItem('attendance_api_url') || window.getApiBase() || '';
      var input = prompt(
        'Configure Render Backend Service URL:\n\n' +
        'Enter your deployed Render Web Service URL (e.g. https://attendance-backend-xxxx.onrender.com or http://localhost:8080):',
        currentUrl
      );
      if (input !== null) {
        var clean = input.trim();
        window.setApiBase(clean);
        alert('Backend URL saved: ' + (clean || 'Default') + '\nTesting connection now...');
        window.checkBackendHealth();
      }
    }

    // Run health check initially
    setTimeout(window.checkBackendHealth, 800);
  }

  window.syncRoleNavigation = syncRoleNavigation;
  window.enforceRouteGuards = enforceRouteGuards;

  function initAll() {
    syncRoleNavigation();
    initRenderStatusWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

})();

if (typeof window !== 'undefined' && typeof window.getApiBase === 'function') {
  var getApiBase = window.getApiBase;
}

import { checkAuth, handleLogin, handleLogout, askConfirm, showToast } from './api.js';
import { loadTelemetry, restartBot, syncWhitelist } from './overview.js';
import {
  switchScheduleView,
  loadSemesterConfig,
  generateSemesterProjection,
  toggleConfigLock,
  updateAutoEndDate,
  loadSchedules,
  loadMeetings,
  filterMeetingsTable,
  selectSubjectDrillDown,
  closeSubjectDrillDown,
  openEditMeetingDialog,
  saveMeetingEdit,
  openSubjectDialog,
  openEditSubjectDialog,
  saveSubject,
  confirmDeleteSubject,
} from './schedules.js';
import {
  loadLecturers,
  openLecturerDialog,
  openEditLecturerDialog,
  saveLecturer,
  confirmDeleteLecturer,
} from './lecturers.js';
import {
  loadAssignments,
  openArchivePage,
  closeArchivePage,
  filterArchiveList,
  openAssignmentDialog,
  openEditAssignmentDialog,
  updateMeetingOptionsForSubject,
  updateDeadlineFromMeeting,
  saveAssignment,
  confirmDeleteAssignment,
  broadcastSingleAssignment,
  broadcastAllActiveAssignments,
  toggleAssignmentDropdown,
} from './assignments.js';
import {
  loadWhitelist,
  filterWhitelistTable,
  loadGroups,
  saveClassGroupSelection,
  loadSubjectGroupMappings,
  saveSubjectGroupMapping,
  openEditMemberNameDialog,
  saveMemberName,
  switchWhitelistView,
} from './whitelist.js';
import { loadLogs } from './logs.js';

// Expose handlers to window for inline HTML triggers
window.handleLogin = (e) => handleLogin(e, () => { loadTelemetry(); loadSemesterConfig(); });
window.handleLogout = handleLogout;
window.restartBot = restartBot;
window.syncWhitelist = syncWhitelist;

window.switchTab = switchTab;
window.switchMobileNav = switchMobileNav;
window.switchWhitelistView = switchWhitelistView;
window.openMoreSheet = openMoreSheet;
window.closeMoreSheet = closeMoreSheet;
window.switchFromSheet = switchFromSheet;

window.switchScheduleView = switchScheduleView;
window.toggleConfigLock = toggleConfigLock;
window.updateAutoEndDate = updateAutoEndDate;
window.generateSemesterProjection = generateSemesterProjection;
window.selectSubjectDrillDown = selectSubjectDrillDown;
window.closeSubjectDrillDown = closeSubjectDrillDown;
window.filterMeetingsTable = filterMeetingsTable;
window.openEditMeetingDialog = openEditMeetingDialog;
window.saveMeetingEdit = saveMeetingEdit;
window.openSubjectDialog = openSubjectDialog;
window.openEditSubjectDialog = openEditSubjectDialog;
window.saveSubject = saveSubject;
window.confirmDeleteSubject = confirmDeleteSubject;

window.openLecturerDialog = openLecturerDialog;
window.openEditLecturerDialog = openEditLecturerDialog;
window.saveLecturer = saveLecturer;
window.confirmDeleteLecturer = confirmDeleteLecturer;

window.openArchivePage = openArchivePage;
window.closeArchivePage = closeArchivePage;
window.filterArchiveList = filterArchiveList;
window.updateMeetingOptionsForSubject = updateMeetingOptionsForSubject;
window.updateDeadlineFromMeeting = updateDeadlineFromMeeting;
window.openAssignmentDialog = openAssignmentDialog;
window.openEditAssignmentDialog = openEditAssignmentDialog;
window.saveAssignment = saveAssignment;
window.confirmDeleteAssignment = confirmDeleteAssignment;
window.broadcastSingleAssignment = broadcastSingleAssignment;
window.broadcastAllActiveAssignments = broadcastAllActiveAssignments;
window.toggleAssignmentDropdown = toggleAssignmentDropdown;

window.loadGroups = loadGroups;
window.saveClassGroupSelection = saveClassGroupSelection;
window.loadSubjectGroupMappings = loadSubjectGroupMappings;
window.saveSubjectGroupMapping = saveSubjectGroupMapping;
window.openEditMemberNameDialog = openEditMemberNameDialog;
window.saveMemberName = saveMemberName;
window.filterWhitelistTable = filterWhitelistTable;

window.loadLogs = loadLogs;

export function switchMobileNav(tabId, btn) {
  document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  switchTab(tabId);
}

export function openMoreSheet() {
  document.getElementById('moreSheet')?.classList.add('open');
}

export function closeMoreSheet(e, force = false) {
  if (force || (e && e.target.id === 'moreSheet')) {
    document.getElementById('moreSheet')?.classList.remove('open');
  }
}

export function switchFromSheet(tabId) {
  closeMoreSheet(null, true);
  document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
  switchTab(tabId);
}

export function switchTab(tabId, el) {
  localStorage.setItem('bot_active_tab', tabId);

  // Clear active states
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-section').forEach(c => c.classList.remove('active'));

  // Activate matching Desktop Sidebar button
  if (el) {
    el.classList.add('active');
  } else {
    document.querySelectorAll('.nav-item').forEach(b => {
      if (b.getAttribute('onclick')?.includes(`'${tabId}'`)) {
        b.classList.add('active');
      }
    });
  }

  // Activate Section
  document.getElementById('tab-' + tabId)?.classList.add('active');

  // Sync mobile bottom tab icons
  if (tabId === 'overview') document.getElementById('btnTabOverview')?.classList.add('active');
  if (tabId === 'schedules') document.getElementById('btnTabSchedules')?.classList.add('active');
  if (tabId === 'lecturers') document.getElementById('btnTabLecturers')?.classList.add('active');
  if (tabId === 'assignments') document.getElementById('btnTabAssignments')?.classList.add('active');

  loadTabContent(tabId);
}

function loadTabContent(tabId) {
  if (tabId === 'overview') loadTelemetry();
  if (tabId === 'schedules') { loadMeetings(); loadSchedules(); }
  if (tabId === 'lecturers') { loadLecturers(); }
  if (tabId === 'assignments') loadAssignments();
  if (tabId === 'whitelist') loadWhitelist();
  if (tabId === 'logs') loadLogs();
}

// Lifecycle Init with Auth & Active Tab Persistence
checkAuth(() => {
  loadTelemetry();
  loadSemesterConfig();

  // Restore Last Active Tab
  const savedTab = localStorage.getItem('bot_active_tab') || 'overview';
  switchTab(savedTab);

  // Restore Subviews if on Schedules or Whitelist tab
  const savedScheduleView = localStorage.getItem('active_schedule_view');
  if (savedScheduleView) {
    switchScheduleView(savedScheduleView);
  }

  const savedWhitelistView = localStorage.getItem('active_whitelist_view');
  if (savedWhitelistView) {
    switchWhitelistView(savedWhitelistView);
  }
});

setInterval(loadTelemetry, 3500);

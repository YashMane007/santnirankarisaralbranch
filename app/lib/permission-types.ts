/**
 * Client-safe permission type definitions.
 * No .server suffix — safe to import in route components.
 */

export type Permission =
  | "view_members"      | "add_members"       | "edit_members"     | "delete_members"
  | "toggle_member_active"
  | "promote_admin"     | "promote_sa"
  | "view_locations"    | "add_locations"      | "edit_locations"   | "delete_locations"  | "toggle_locations"
  | "add_schedules"     | "edit_schedules"     | "delete_schedules"
  | "view_attendance"   | "mark_attendance"    | "edit_attendance"  | "delete_attendance"
  | "bulk_mark_attendance"
  | "export_data"       | "view_audit_log"
  | "view_announcements" | "create_announcements" | "edit_announcements" | "delete_announcements";

export const ALL_PERMISSIONS: { key: Permission; label: string; group: string }[] = [
  { key: "view_members",    label: "View members",        group: "Members" },
  { key: "add_members",     label: "Add members",         group: "Members" },
  { key: "edit_members",    label: "Edit member details", group: "Members" },
  { key: "delete_members",       label: "Delete members",        group: "Members" },
  { key: "toggle_member_active",  label: "Activate/deactivate",   group: "Members" },
  { key: "promote_admin",   label: "Promote to admin",    group: "Members" },
  { key: "promote_sa",      label: "Promote to SA",       group: "Members" },
  { key: "view_locations",   label: "View locations",     group: "Locations" },
  { key: "add_locations",    label: "Add locations",      group: "Locations" },
  { key: "edit_locations",   label: "Edit locations",     group: "Locations" },
  { key: "delete_locations",  label: "Delete locations",   group: "Locations" },
  { key: "toggle_locations",  label: "Activate/deactivate",group: "Locations" },
  { key: "add_schedules",    label: "Add schedules",      group: "Locations" },
  { key: "edit_schedules",   label: "Edit schedules",     group: "Locations" },
  { key: "delete_schedules", label: "Delete schedules",   group: "Locations" },
  { key: "view_attendance",      label: "View attendance",      group: "Attendance" },
  { key: "mark_attendance",      label: "Mark attendance",      group: "Attendance" },
  { key: "bulk_mark_attendance", label: "Bulk mark attendance", group: "Attendance" },
  { key: "edit_attendance",      label: "Edit attendance",      group: "Attendance" },
  { key: "delete_attendance",    label: "Delete attendance",    group: "Attendance" },
  { key: "export_data",             label: "Export CSV/PDF",         group: "Data" },
  { key: "view_audit_log",          label: "View audit log",          group: "Data" },
  { key: "view_announcements",      label: "View announcements",      group: "Announcements" },
  { key: "create_announcements",    label: "Create announcements",    group: "Announcements" },
  { key: "edit_announcements",      label: "Edit announcements",      group: "Announcements" },
  { key: "delete_announcements",    label: "Delete announcements",    group: "Announcements" },
];

export const PERM_GROUPS = Array.from(new Set(ALL_PERMISSIONS.map(p => p.group)));

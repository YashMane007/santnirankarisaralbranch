/** All D1 database queries — server-side only. */

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Member {
  id: string; name: string; phone: string | null; dob: string | null;
  gender: string | null; zone: string | null; pin_hash: string | null;
  pin_salt: string | null; pin_set: number; is_admin: number;
  is_super_admin: number; is_active: number; photo_key: string | null;
  created_at: string; updated_at: string;
}
export interface Location {
  id: number; name: string; address: string | null; lat: number; lng: number;
  radius_meters: number; is_active: number; created_at: string;
}
export interface LocationSchedule {
  id: number; location_id: number; label: string; satsang_type_name: string | null;
  date: string; all_day: number; start_time: string | null; end_time: string | null;
  is_active: number; created_at: string;
}
export type ScheduleWithLocation = LocationSchedule & {
  location_name: string; location_lat: number; location_lng: number; location_radius: number;
};
export interface AttendanceRecord {
  id: number; member_id: string; member_name: string | null; seva_role: string | null;
  location_id: number | null; location_name: string | null; date: string;
  marked_at: string | null; lat: number | null; lng: number | null;
  accuracy: number | null; distance_meters: number | null; schedule_id: number;
  satsang_type: string | null; session_label: string | null;
  marked_by_id: string | null; marked_by_name: string | null;
}
export interface SatsangType { id: number; name: string; is_active: number; sort_order: number; }
export interface SevaRole    { id: number; name: string; is_active: number; sort_order: number; }

// ─── Members ──────────────────────────────────────────────────────────────────
export async function getMemberById(db: D1Database, id: string): Promise<Member | null> {
  return db.prepare("SELECT * FROM members WHERE id = ?").bind(id).first<Member>();
}
export async function memberIdExists(db: D1Database, id: string): Promise<boolean> {
  return (await db.prepare("SELECT id FROM members WHERE id = ?").bind(id).first()) !== null;
}
export async function listMembers(db: D1Database, opts: { activeOnly?: boolean; search?: string; sortBy?: string; sortDir?: "asc"|"desc"; excludeSuperAdmins?: boolean } = {}): Promise<Member[]> {
  let q = "SELECT * FROM members";
  const b: (string|number)[] = [];
  const c: string[] = [];
  if (opts.activeOnly) c.push("is_active = 1");
  if (opts.excludeSuperAdmins) c.push("(is_super_admin IS NULL OR is_super_admin = 0)");
  if (opts.search) { c.push("(name LIKE ? OR id LIKE ? OR zone LIKE ?)"); b.push(`%${opts.search}%`,`%${opts.search}%`,`%${opts.search}%`); }
  if (c.length) q += " WHERE " + c.join(" AND ");
  const col = ["name","id","zone","created_at"].includes(opts.sortBy ?? "") ? opts.sortBy : "name";
  q += ` ORDER BY ${col} ${opts.sortDir === "desc" ? "DESC" : "ASC"}`;
  return (await db.prepare(q).bind(...b).all<Member>()).results;
}
export async function getMemberByPhone(db: D1Database, phone: string): Promise<Member|null> {
  return db.prepare("SELECT * FROM members WHERE phone = ? AND is_active = 1 LIMIT 1").bind(phone.trim()).first<Member>();
}
export async function phoneExistsForOther(db: D1Database, phone: string, excludeId: string): Promise<boolean> {
  const r = await db.prepare("SELECT id FROM members WHERE phone = ? AND id != ? LIMIT 1").bind(phone.trim(), excludeId).first<{id:string}>();
  return !!r;
}
export async function createMember(db: D1Database, data: { id:string;name:string;phone?:string;dob?:string;gender?:string;zone?:string;is_admin?:boolean;is_super_admin?:boolean; }): Promise<void> {
  await db.prepare(`INSERT INTO members (id,name,phone,dob,gender,zone,is_admin,is_super_admin,is_active,pin_set,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,0,datetime('now'),datetime('now'))`)
    .bind(data.id,data.name,data.phone??null,data.dob??null,data.gender??null,data.zone??null,data.is_admin?1:0,data.is_super_admin?1:0).run();
}
export async function updateMember(db: D1Database, id: string, data: Partial<{name:string;phone:string;dob:string;gender:string;zone:string;is_admin:number;is_super_admin:number;is_active:number;photo_key:string;}>): Promise<void> {
  const fields = Object.entries(data).filter(([,v])=>v!==undefined).map(([k])=>`${k} = ?`);
  const values = Object.values(data).filter(v=>v!==undefined);
  if (!fields.length) return;
  fields.push("updated_at = datetime('now')");
  await db.prepare(`UPDATE members SET ${fields.join(", ")} WHERE id = ?`).bind(...values, id).run();
}
export async function deleteMember(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM members WHERE id = ?").bind(id).run();
}
export async function setMemberPin(db: D1Database, id: string, h: string, s: string): Promise<void> {
  await db.prepare(`UPDATE members SET pin_hash=?,pin_salt=?,pin_set=1,updated_at=datetime('now') WHERE id=?`).bind(h,s,id).run();
}
export async function resetMemberPin(db: D1Database, id: string): Promise<void> {
  await db.prepare(`UPDATE members SET pin_hash=NULL,pin_salt=NULL,pin_set=0,updated_at=datetime('now') WHERE id=?`).bind(id).run();
}
export async function bulkCreateMembers(db: D1Database, rows: Array<{id:string;name:string;phone?:string;dob?:string;gender?:string;zone?:string}>): Promise<{success:string[];errors:Array<{row:number;id:string;reason:string}>}> {
  const success: string[] = [], errors: Array<{row:number;id:string;reason:string}> = [];
  for (let i=0;i<rows.length;i++) {
    const r = rows[i];
    if (!r.id||!r.name) { errors.push({row:i+2,id:r.id??"(empty)",reason:"ID and Name required."}); continue; }
    const idC = r.id.trim().toUpperCase();
    if (!/^[A-Z0-9\-_]+$/.test(idC)) { errors.push({row:i+2,id:idC,reason:"Invalid ID format."}); continue; }
    if (await memberIdExists(db,idC)) { errors.push({row:i+2,id:idC,reason:"ID already exists."}); continue; }
    try { await createMember(db,{...r,id:idC}); success.push(idC); }
    catch(e:any) { errors.push({row:i+2,id:idC,reason:e?.message??"Error."}); }
  }
  return {success,errors};
}

// ─── Locations ────────────────────────────────────────────────────────────────
export async function listLocations(db: D1Database, activeOnly=false): Promise<Location[]> {
  const q = activeOnly?"SELECT * FROM locations WHERE is_active=1 ORDER BY name":"SELECT * FROM locations ORDER BY name";
  return (await db.prepare(q).all<Location>()).results;
}
export async function getLocationById(db: D1Database, id: number): Promise<Location|null> {
  return db.prepare("SELECT * FROM locations WHERE id=?").bind(id).first<Location>();
}
export async function createLocation(db: D1Database, data:{name:string;address?:string;lat:number;lng:number;radius_meters:number}): Promise<void> {
  await db.prepare(`INSERT INTO locations (name,address,lat,lng,radius_meters,is_active,created_at) VALUES (?,?,?,?,?,1,datetime('now'))`)
    .bind(data.name,data.address??null,data.lat,data.lng,data.radius_meters).run();
}
export async function updateLocation(db: D1Database, id: number, data: Partial<{name:string;address:string;lat:number;lng:number;radius_meters:number;is_active:number}>): Promise<void> {
  const fields = Object.entries(data).filter(([,v])=>v!==undefined).map(([k])=>`${k} = ?`);
  const values = Object.values(data).filter(v=>v!==undefined);
  if (!fields.length) return;
  await db.prepare(`UPDATE locations SET ${fields.join(", ")} WHERE id=?`).bind(...values,id).run();
}

export async function deleteLocation(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM location_schedules WHERE location_id=?").bind(id).run();
  await db.prepare("DELETE FROM locations WHERE id=?").bind(id).run();
}

// ─── Location Schedules ───────────────────────────────────────────────────────
export async function getSchedulesForLocation(db: D1Database, locationId: number): Promise<LocationSchedule[]> {
  return (await db.prepare("SELECT * FROM location_schedules WHERE location_id=? ORDER BY date DESC, start_time ASC").bind(locationId).all<LocationSchedule>()).results;
}
export async function getActiveSchedulesForDate(db: D1Database, date: string): Promise<ScheduleWithLocation[]> {
  return (await db.prepare(`SELECT ls.*,l.name as location_name,l.lat as location_lat,l.lng as location_lng,l.radius_meters as location_radius FROM location_schedules ls JOIN locations l ON l.id=ls.location_id WHERE ls.date=? AND ls.is_active=1 AND l.is_active=1 ORDER BY ls.start_time ASC`).bind(date).all<ScheduleWithLocation>()).results;
}
export async function createLocationSchedule(db: D1Database, data:{location_id:number;label:string;satsang_type_name?:string;date:string;all_day:boolean;start_time?:string;end_time?:string}): Promise<void> {
  await db.prepare(`INSERT INTO location_schedules (location_id,label,satsang_type_name,date,all_day,start_time,end_time,is_active,created_at) VALUES (?,?,?,?,?,?,?,1,datetime('now'))`)
    .bind(data.location_id,data.label,data.satsang_type_name??null,data.date,data.all_day?1:0,data.start_time??null,data.end_time??null).run();
}
export async function updateLocationSchedule(db: D1Database, id: number, data:{label?:string;satsang_type_name?:string;date?:string;all_day?:number;start_time?:string|null;end_time?:string|null}): Promise<void> {
  const fields = Object.keys(data).map(k=>`${k} = ?`);
  const values = Object.values(data);
  if (!fields.length) return;
  await db.prepare(`UPDATE location_schedules SET ${fields.join(", ")} WHERE id=?`).bind(...values,id).run();
}
export async function deleteLocationSchedule(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM location_schedules WHERE id=?").bind(id).run();
}

// ─── Attendance ───────────────────────────────────────────────────────────────
export async function getAttendanceRecord(db: D1Database, memberId: string, date: string, scheduleId=0): Promise<AttendanceRecord|null> {
  return db.prepare("SELECT * FROM attendance WHERE member_id=? AND date=? AND schedule_id=?").bind(memberId,date,scheduleId).first<AttendanceRecord>();
}
export async function getTodayAttendanceAll(db: D1Database, memberId: string, date: string): Promise<AttendanceRecord[]> {
  return (await db.prepare("SELECT * FROM attendance WHERE member_id=? AND date=? ORDER BY marked_at").bind(memberId,date).all<AttendanceRecord>()).results;
}
export async function markAttendance(db: D1Database, data:{memberId:string;memberName:string;sevaRole:string|null;locationId:number;locationName:string;date:string;lat:number;lng:number;accuracy:number;distanceMeters:number;scheduleId?:number;satsangType?:string;sessionLabel?:string;markedById?:string;markedByName?:string;}): Promise<void> {
  await db.prepare(`INSERT INTO attendance (member_id,member_name,seva_role,location_id,location_name,date,marked_at,lat,lng,accuracy,distance_meters,schedule_id,satsang_type,session_label,marked_by_id,marked_by_name) VALUES (?,?,?,?,?,?,datetime('now'),?,?,?,?,?,?,?,?,?) ON CONFLICT(member_id,date,schedule_id) DO NOTHING`)
    .bind(data.memberId,data.memberName,data.sevaRole??null,data.locationId,data.locationName,data.date,data.lat,data.lng,data.accuracy,data.distanceMeters,data.scheduleId??0,data.satsangType??null,data.sessionLabel??null,data.markedById??null,data.markedByName??null).run();
}
export async function updateAttendance(db: D1Database, id: number, data: Partial<{seva_role:string;location_id:number;location_name:string;date:string;marked_at:string;}>): Promise<void> {
  const fields = Object.keys(data).map(k=>`${k} = ?`);
  const values = Object.values(data);
  if (!fields.length) return;
  await db.prepare(`UPDATE attendance SET ${fields.join(", ")} WHERE id=?`).bind(...values,id).run();
}
export async function deleteAttendance(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM attendance WHERE id=?").bind(id).run();
}
export async function getMemberAttendanceHistory(db: D1Database, memberId: string, limit=10): Promise<AttendanceRecord[]> {
  return (await db.prepare("SELECT * FROM attendance WHERE member_id=? ORDER BY date DESC, marked_at DESC LIMIT ?").bind(memberId,limit).all<AttendanceRecord>()).results;
}
export async function getMemberMonthAttendanceCount(db: D1Database, memberId: string, yearMonth: string): Promise<number> {
  return (await db.prepare("SELECT COUNT(DISTINCT date) as cnt FROM attendance WHERE member_id=? AND date LIKE ?").bind(memberId,`${yearMonth}%`).first<{cnt:number}>())?.cnt ?? 0;
}
export async function getMemberTotalAttendanceCount(db: D1Database, memberId: string): Promise<number> {
  return (await db.prepare("SELECT COUNT(DISTINCT date) as cnt FROM attendance WHERE member_id=?").bind(memberId).first<{cnt:number}>())?.cnt ?? 0;
}

// ─── Admin Stats ──────────────────────────────────────────────────────────────
export interface DailyStats {
  uniquePresentCount: number;  // unique non-super-admin members
  sessionAttendanceCount: number; // total records (multi-session)
  totalActive: number;
  byRole: {seva_role:string;cnt:number}[];
  byLocation: {location_name:string;cnt:number}[];
}
export async function getDailyStats(db: D1Database, date: string): Promise<DailyStats> {
  const [uniqRow, sessionRow, totalRow, byRole, byLocation] = await Promise.all([
    db.prepare(`SELECT COUNT(DISTINCT a.member_id) as cnt FROM attendance a LEFT JOIN members m ON m.id=a.member_id WHERE a.date=? AND (m.is_super_admin IS NULL OR m.is_super_admin=0)`).bind(date).first<{cnt:number}>(),
    db.prepare(`SELECT COUNT(*) as cnt FROM attendance a LEFT JOIN members m ON m.id=a.member_id WHERE a.date=? AND (m.is_super_admin IS NULL OR m.is_super_admin=0)`).bind(date).first<{cnt:number}>(),
    db.prepare("SELECT COUNT(*) as cnt FROM members WHERE is_active=1 AND (is_super_admin IS NULL OR is_super_admin=0)").first<{cnt:number}>(),
    db.prepare(`SELECT COALESCE(seva_role,'Unknown') as seva_role,COUNT(*) as cnt FROM attendance WHERE date=? GROUP BY seva_role ORDER BY cnt DESC`).bind(date).all<{seva_role:string;cnt:number}>(),
    db.prepare(`SELECT COALESCE(location_name,'Unknown') as location_name,COUNT(*) as cnt FROM attendance WHERE date=? GROUP BY location_name ORDER BY cnt DESC`).bind(date).all<{location_name:string;cnt:number}>(),
  ]);
  return { uniquePresentCount:uniqRow?.cnt??0, sessionAttendanceCount:sessionRow?.cnt??0, totalActive:totalRow?.cnt??0, byRole:byRole.results, byLocation:byLocation.results };
}

export async function getAttendanceLog(db: D1Database, date: string, page=1, pageSize=50, filters:{sevaRole?:string;location?:string;search?:string;sortBy?:string;sortDir?:"asc"|"desc";toDate?:string}={}): Promise<{records:AttendanceRecord[];total:number}> {
  const offset=(page-1)*pageSize;
  // Support date range: if toDate provided, use BETWEEN
  const clauses = filters.toDate && filters.toDate !== date
    ? ["a.date >= ? AND a.date <= ?"]
    : ["a.date = ?"];
  const b:(string|number)[] = filters.toDate && filters.toDate !== date
    ? [date, filters.toDate]
    : [date];
  if (filters.sevaRole) { clauses.push("a.seva_role = ?"); b.push(filters.sevaRole); }
  if (filters.location) { clauses.push("a.location_name = ?"); b.push(filters.location); }
  if (filters.search)   { clauses.push("(a.member_name LIKE ? OR a.member_id LIKE ?)"); b.push(`%${filters.search}%`,`%${filters.search}%`); }
  const where="WHERE "+clauses.join(" AND ");
  const sortCol = ["member_name","member_id","seva_role","marked_at","location_name"].includes(filters.sortBy??"") ? filters.sortBy : "marked_at";
  const sortDir = filters.sortDir==="asc"?"ASC":"DESC";
  const [records,totalRow]=await Promise.all([
    db.prepare(`SELECT a.* FROM attendance a ${where} ORDER BY a.${sortCol} ${sortDir} LIMIT ? OFFSET ?`).bind(...b,pageSize,offset).all<AttendanceRecord>(),
    db.prepare(`SELECT COUNT(*) as cnt FROM attendance a ${where}`).bind(...b).first<{cnt:number}>(),
  ]);
  return {records:records.results,total:totalRow?.cnt??0};
}

export async function getAbsentList(db: D1Database, date: string, filters:{search?:string;sortBy?:string;sortDir?:"asc"|"desc"}={}): Promise<Member[]> {
  const clauses=["m.is_active=1","(m.is_super_admin IS NULL OR m.is_super_admin=0)"];
  const b:(string|number)[]=[]; 
  if (filters.search) { clauses.push("(m.name LIKE ? OR m.id LIKE ?)"); b.push(`%${filters.search}%`,`%${filters.search}%`); }
  const sortCol=["name","id","zone"].includes(filters.sortBy??"")?filters.sortBy:"name";
  const sortDir=filters.sortDir==="desc"?"DESC":"ASC";
  return (await db.prepare(`SELECT m.* FROM members m WHERE ${clauses.join(" AND ")} AND m.id NOT IN (SELECT DISTINCT member_id FROM attendance WHERE date=?) ORDER BY m.${sortCol} ${sortDir}`).bind(...b,date).all<Member>()).results;
}

export async function getAttendanceForExport(db: D1Database, from: string, to: string, filters: { search?: string; role?: string; loc?: string } = {}): Promise<AttendanceRecord[]> {
  const c: string[] = ["date >= ?", "date <= ?"];
  const b: (string|number)[] = [from, to];
  if (filters.search) { c.push("(member_name LIKE ? OR member_id LIKE ?)"); b.push(`%${filters.search}%`, `%${filters.search}%`); }
  if (filters.role)   { c.push("seva_role = ?");      b.push(filters.role); }
  if (filters.loc)    { c.push("location_name = ?");  b.push(filters.loc); }
  return (await db.prepare(`SELECT * FROM attendance WHERE ${c.join(" AND ")} ORDER BY date ASC, member_name ASC`).bind(...b).all<AttendanceRecord>()).results;
}

// ─── Satsang Types ────────────────────────────────────────────────────────────
export async function listSatsangTypes(db: D1Database, activeOnly=false): Promise<SatsangType[]> {
  const q=activeOnly?"SELECT * FROM satsang_types WHERE is_active=1 ORDER BY sort_order,name":"SELECT * FROM satsang_types ORDER BY sort_order,name";
  return (await db.prepare(q).all<SatsangType>()).results;
}
export async function createSatsangType(db: D1Database, name: string): Promise<void> {
  const m=(await db.prepare("SELECT MAX(sort_order) as m FROM satsang_types").first<{m:number}>())?.m??0;
  await db.prepare("INSERT INTO satsang_types (name,sort_order) VALUES (?,?)").bind(name,m+1).run();
}
export async function updateSatsangType(db: D1Database, id: number, data: Partial<{name:string;is_active:number}>): Promise<void> {
  const fields=Object.keys(data).map(k=>`${k} = ?`); const values=Object.values(data);
  if (!fields.length) return;
  await db.prepare(`UPDATE satsang_types SET ${fields.join(", ")} WHERE id=?`).bind(...values,id).run();
}
export async function deleteSatsangType(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM satsang_types WHERE id=?").bind(id).run();
}

// ─── Seva Roles List ──────────────────────────────────────────────────────────
export async function listSevaRoles(db: D1Database, activeOnly=false): Promise<SevaRole[]> {
  const q=activeOnly?"SELECT * FROM seva_roles_list WHERE is_active=1 ORDER BY sort_order,name":"SELECT * FROM seva_roles_list ORDER BY sort_order,name";
  return (await db.prepare(q).all<SevaRole>()).results;
}
export async function createSevaRole(db: D1Database, name: string): Promise<void> {
  const m=(await db.prepare("SELECT MAX(sort_order) as m FROM seva_roles_list").first<{m:number}>())?.m??0;
  await db.prepare("INSERT INTO seva_roles_list (name,sort_order) VALUES (?,?)").bind(name,m+1).run();
}
export async function updateSevaRole(db: D1Database, id: number, data: Partial<{name:string;is_active:number}>): Promise<void> {
  const fields=Object.keys(data).map(k=>`${k} = ?`); const values=Object.values(data);
  if (!fields.length) return;
  await db.prepare(`UPDATE seva_roles_list SET ${fields.join(", ")} WHERE id=?`).bind(...values,id).run();
}
export async function deleteSevaRole(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM seva_roles_list WHERE id=?").bind(id).run();
}


/** Returns array of location IDs that have at least one schedule ever configured.
 *  Used to distinguish "always active" (no schedules) from "schedule-controlled". */
export async function getLocationsWithAnySchedule(db: D1Database): Promise<number[]> {
  const r = await db.prepare(
    "SELECT DISTINCT location_id FROM location_schedules"
  ).all<{ location_id: number }>();
  return r.results.map(row => row.location_id);
}

// ─── Announcements ────────────────────────────────────────────────────────────
export interface Announcement {
  id: number;
  title: string;
  body: string | null;
  image_key: string | null;
  type: string;
  show_to: string;
  show_to_array: string | null; // JSON array: ["guest", "member", "admin"]
  is_active: number;
  is_pinned: number;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
}

export async function listAnnouncements(db: D1Database, opts: { activeOnly?: boolean; showTo?: string } = {}): Promise<Announcement[]> {
  const clauses: string[] = [];
  if (opts.activeOnly) {
    clauses.push("is_active = 1");
    clauses.push("(expires_at IS NULL OR expires_at > datetime('now'))");
  }
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const r = await db.prepare(`SELECT * FROM announcements ${where} ORDER BY is_pinned DESC, created_at DESC`).all<Announcement>();
  
  // Filter by visibility in JavaScript (safe for JSON arrays)
  if (!opts.showTo) return r.results;
  
  return r.results.filter(ann => {
    const showToArray = ann.show_to_array ? JSON.parse(ann.show_to_array) : null;
    
    // Old format: single value in show_to column
    if (showToArray === null) {
      if (opts.showTo === "guest") return ann.show_to === "public" || ann.show_to === "all";
      if (opts.showTo === "member") return ann.show_to === "public" || ann.show_to === "all" || ann.show_to === "members";
      if (opts.showTo === "admin") return true; // admins see all
    }
    
    // New format: array in show_to_array column
    if (Array.isArray(showToArray)) {
      // Empty array = invisible to everyone
      if (showToArray.length === 0) return false;
      
      if (opts.showTo === "guest") return showToArray.includes("guest");
      if (opts.showTo === "member") return showToArray.includes("guest") || showToArray.includes("member");
      if (opts.showTo === "admin") return true; // admins see all
    }
    
    return false;
  });
}

export async function createAnnouncement(db: D1Database, data: { title: string; body?: string; image_key?: string; type?: string; show_to?: string | string[]; is_pinned?: boolean; created_by?: string; expires_at?: string }): Promise<void> {
  // Handle both old single value (string) and new array format
  let showToValue = "public";
  let showToArray = '["guest","member","admin"]';
  
  if (typeof data.show_to === "string") {
    showToValue = data.show_to;
    // Legacy format mapping
    if (data.show_to === "public" || data.show_to === "all") showToArray = '["guest","member","admin"]';
    else if (data.show_to === "members") showToArray = '["member","admin"]';
    else if (data.show_to === "admins") showToArray = '["admin"]';
  } else if (Array.isArray(data.show_to)) {
    showToArray = JSON.stringify(data.show_to);
    showToValue = data.show_to.includes("guest") ? "public" : "members";
  }
  
  await db.prepare(`INSERT INTO announcements (title, body, image_key, type, show_to, show_to_array, is_pinned, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`)
    .bind(data.title, data.body ?? null, data.image_key ?? null, data.type ?? "notice", showToValue, showToArray, data.is_pinned ? 1 : 0, data.created_by ?? null, data.expires_at ?? null).run();
}

export async function updateAnnouncement(db: D1Database, id: number, data: Partial<{ title: string; body: string; is_active: number; is_pinned: number; expires_at: string; show_to: string | string[] }>): Promise<void> {
  // Handle show_to conversion
  const updateData = { ...data };
  if (data.show_to !== undefined) {
    let showToArray = '["guest","member","admin"]';
    let showToValue = "public";
    
    if (typeof data.show_to === "string") {
      showToValue = data.show_to;
      if (data.show_to === "public" || data.show_to === "all") showToArray = '["guest","member","admin"]';
      else if (data.show_to === "members") showToArray = '["member","admin"]';
      else if (data.show_to === "admins") showToArray = '["admin"]';
    } else if (Array.isArray(data.show_to)) {
      showToArray = JSON.stringify(data.show_to);
      showToValue = data.show_to.includes("guest") ? "public" : (data.show_to.length > 0 ? "members" : "");
    }
    
    updateData.show_to = showToValue;
    (updateData as any).show_to_array = showToArray;
  }
  
  // Filter out undefined
  const filtered = Object.fromEntries(Object.entries(updateData).filter(([, v]) => v !== undefined)) as Record<string, any>;
  // Convert empty strings to null for nullable fields
  for (const k of ["body", "expires_at"]) {
    if (filtered[k] === "") filtered[k] = null;
  }
  const fields = Object.keys(filtered).map(k => `${k} = ?`);
  const values = Object.values(filtered);
  if (!fields.length) return;
  await db.prepare(`UPDATE announcements SET ${fields.join(", ")} WHERE id = ?`).bind(...values, id).run();
}

export async function deleteAnnouncement(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
}

// ─── Location History ─────────────────────────────────────────────────────────
export async function recordLocationHistory(db: D1Database, memberId: string, lat: number, lng: number, accuracy: number | null, context: string, attendanceId?: number): Promise<void> {
  try {
    await db.prepare("INSERT INTO location_history (member_id, lat, lng, accuracy, context, attendance_id, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))")
      .bind(memberId, lat, lng, accuracy ?? null, context, attendanceId ?? null).run();
  } catch {}
}

export async function getMemberLocationHistory(db: D1Database, memberId: string, limit = 50): Promise<{id:number;lat:number;lng:number;accuracy:number|null;context:string;created_at:string}[]> {
  const r = await db.prepare("SELECT * FROM location_history WHERE member_id = ? ORDER BY created_at DESC LIMIT ?").bind(memberId, limit).all<any>();
  return r.results;
}

// ─── Session History ──────────────────────────────────────────────────────────
export async function recordSessionHistory(db: D1Database, data: { schedule_id?: number; location_id?: number; location_name?: string; session_label?: string; satsang_type?: string; date: string; total_present: number; total_absent: number; created_by_id?: string; created_by_name?: string }): Promise<void> {
  await db.prepare(`INSERT OR REPLACE INTO session_history (schedule_id, location_id, location_name, session_label, satsang_type, date, total_present, total_absent, created_by_id, created_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
    .bind(data.schedule_id ?? null, data.location_id ?? null, data.location_name ?? null, data.session_label ?? null, data.satsang_type ?? null, data.date, data.total_present, data.total_absent, data.created_by_id ?? null, data.created_by_name ?? null).run();
}

export async function getSessionHistory(db: D1Database, from: string, to: string): Promise<any[]> {
  const r = await db.prepare("SELECT * FROM session_history WHERE date >= ? AND date <= ? ORDER BY date DESC").bind(from, to).all<any>();
  return r.results;
}

// ─── Attendance export with column support ────────────────────────────────────
export async function getAttendanceForExportFiltered(db: D1Database, from: string, to: string): Promise<AttendanceRecord[]> {
  const r = await db.prepare(`SELECT * FROM attendance WHERE date >= ? AND date <= ? ORDER BY date ASC, member_name ASC`).bind(from, to).all<AttendanceRecord>();
  return r.results;
}

// ─── Birthday queries ─────────────────────────────────────────────────────────
export async function getMembersWithBirthdayToday(db: D1Database): Promise<Member[]> {
  // DOB stored as YYYY-MM-DD — match MM-DD part
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const mmdd = today.slice(5); // MM-DD
  const r = await db.prepare("SELECT * FROM members WHERE is_active = 1 AND dob LIKE ? ORDER BY name").bind(`%-${mmdd}`).all<Member>();
  return r.results;
}

// ─── Trend data for charts ────────────────────────────────────────────────────
export async function getAttendanceTrend(db: D1Database, days = 30): Promise<{date:string;present:number}[]> {
  const from = new Date(Date.now() - days * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const r = await db.prepare(
    `SELECT date, COUNT(DISTINCT member_id) as present FROM attendance
     WHERE date >= ? GROUP BY date ORDER BY date ASC`
  ).bind(from).all<{date:string;present:number}>();
  return r.results;
}

export type RoutePoint = { lat: number; lng: number };

export const workRoleLabels = {
  site_manager: '現場負責人',
  climber: '攀樹人員',
  ground: '地面人員',
  vehicle: '吊車／車輛人員',
  equipment: '器材清點人員',
  support: '其他支援人員',
} as const;

export type WorkRole = keyof typeof workRoleLabels;
export type WorkScheduleStatus = '待排程' | '已排程' | '進行中' | '已完成' | '取消';
export type WorkScheduleSlot = '全天' | '上午' | '下午';

export type Personnel = {
  id: string;
  name: string;
  code: string;
  jobTitle: string;
  note: string;
  skills: string[];
  allowedRoles: WorkRole[];
  status: 'active' | 'archived';
  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type PersonnelAssignment = {
  personnelId: string;
  nameSnapshot: string;
  codeSnapshot?: string;
  role: WorkRole;
};

export const equipmentPackageLabels = {
  general: '通用公裝',
  pruning: '修剪作業',
  removal: '伐除作業',
  climbing: '攀樹作業',
  crane: '吊車作業',
} as const;

export type EquipmentPackage = keyof typeof equipmentPackageLabels;

export type EquipmentCatalogItem = {
  id: string;
  name: string;
  unit: string;
  defaultQuantity: number;
  packages: EquipmentPackage[];
  note: string;
  status: 'active' | 'archived';
  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type WorkEquipmentItem = {
  catalogId?: string;
  name: string;
  quantity: number;
  unit: string;
};

export type WorkRecord = {
  id: string;
  locationId: string;
  authorId?: string;
  authorName: string;
  title: string;
  notes: string;
  imageUrls: string[];
  youtubeUrls: string[];
  fileUrls: string[];
  routePoints?: RoutePoint[];
  routeNotes?: string;
  sourceImported?: boolean;
  createdAt?: any;
  dateLabel?: string;
  workDate?: string;
  endDate?: string;
  crew?: string[];
  siteLead?: PersonnelAssignment;
  crewAssignments?: PersonnelAssignment[];
  scheduleStatus?: WorkScheduleStatus;
  scheduleSlot?: WorkScheduleSlot;
  estimatedDays?: number;
  workTypes?: EquipmentPackage[];
  equipmentItems?: WorkEquipmentItem[];
  meetingTime?: string;
  meetingPlace?: string;
  mapUrl?: string;
  weather?: string;
  hospitalName?: string;
  hospitalPhone?: string;
  hospitalDistance?: string;
  hospitalTravelTime?: string;
  workDetails?: string;
  assignments?: string;
  crane?: string;
  disposal?: string;
  parking?: string;
  roadPermit?: string;
  equipment?: string;
  safetyNotes?: string;
};

export type SiteLocation = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  status: string;
  attention: string;
  aliases: string[];
  records?: WorkRecord[];
  isDemo?: boolean;
  recordCount?: number;
  latestRecordAt?: unknown;
  latestRecordTitle?: string;
  updatedAt?: any;
  createdBy?: string;
};

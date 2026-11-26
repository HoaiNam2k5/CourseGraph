export type EntityLabel = 'MonHoc' | 'SinhVien' | 'GiangVien' | 'Khoa' | 'HocKy' | 'ChuongTrinhDaoTao';

export interface EntityField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'email';
  required: boolean;
}

export interface EntityDefinition {
  label: EntityLabel;
  key: string;
  file: string;
  slug: string;
  title: string;
  fields: EntityField[];
}

const field = (key: string, label: string, type: EntityField['type'] = 'string'): EntityField => ({ key, label, type, required: true });

export const entityDefinitions: EntityDefinition[] = [
  { label: 'MonHoc', key: 'MaMH', file: 'MonHoc.csv', slug: 'courses', title: 'Môn học', fields: [field('MaMH', 'Mã môn'), field('TenMH', 'Tên môn học'), field('SoTC', 'Số tín chỉ', 'number'), field('LoaiMon', 'Loại môn')] },
  { label: 'SinhVien', key: 'MaSV', file: 'SinhVien.csv', slug: 'students', title: 'Sinh viên', fields: [field('MaSV', 'Mã sinh viên'), field('HoTen', 'Họ tên'), field('NgaySinh', 'Ngày sinh', 'date'), field('GioiTinh', 'Giới tính'), field('Email', 'Email', 'email'), field('SDT', 'Số điện thoại'), field('KhoaHoc', 'Khóa học')] },
  { label: 'GiangVien', key: 'MaGV', file: 'GiangVien.csv', slug: 'lecturers', title: 'Giảng viên', fields: [field('MaGV', 'Mã giảng viên'), field('HoTen', 'Họ tên'), field('Email', 'Email', 'email'), field('SDT', 'Số điện thoại'), field('HocVi', 'Học vị')] },
  { label: 'Khoa', key: 'MaKhoa', file: 'Khoa.csv', slug: 'faculties', title: 'Khoa', fields: [field('MaKhoa', 'Mã khoa'), field('TenKhoa', 'Tên khoa')] },
  { label: 'HocKy', key: 'MaHK', file: 'HocKy.csv', slug: 'semesters', title: 'Học kỳ', fields: [field('MaHK', 'Mã học kỳ'), field('TenHK', 'Tên học kỳ'), field('NamHoc', 'Năm học')] },
  { label: 'ChuongTrinhDaoTao', key: 'MaChuongTrinh', file: 'ChuongTrinhDaoTao.csv', slug: 'programs', title: 'Chương trình đào tạo', fields: [field('MaChuongTrinh', 'Mã chương trình'), field('TenChuongTrinh', 'Tên chương trình'), field('NamBatDau', 'Năm bắt đầu', 'number'), field('ThoiGianDaoTao', 'Thời gian đào tạo', 'number')] },
];

export const businessLabels: EntityLabel[] = entityDefinitions.map(({ label }) => label);

export interface RelationshipDefinition {
  type: string;
  from: EntityLabel;
  to: EntityLabel;
  title: string;
}

export const relationshipDefinitions: RelationshipDefinition[] = [
  { type: 'TIEN_QUYET_CHO', from: 'MonHoc', to: 'MonHoc', title: 'Tiên quyết cho' },
  { type: 'THUOC_KHOA', from: 'MonHoc', to: 'Khoa', title: 'Môn học thuộc khoa' },
  { type: 'THUOC_KHOA', from: 'SinhVien', to: 'Khoa', title: 'Sinh viên thuộc khoa' },
  { type: 'THUOC_KHOA', from: 'GiangVien', to: 'Khoa', title: 'Giảng viên thuộc khoa' },
  { type: 'QUAN_LY', from: 'Khoa', to: 'ChuongTrinhDaoTao', title: 'Quản lý chương trình' },
  { type: 'BAO_GOM', from: 'ChuongTrinhDaoTao', to: 'MonHoc', title: 'Bao gồm môn học' },
  { type: 'THEO_HOC', from: 'SinhVien', to: 'ChuongTrinhDaoTao', title: 'Theo học chương trình' },
  { type: 'DA_HOC', from: 'SinhVien', to: 'MonHoc', title: 'Đã hoàn thành môn' },
  { type: 'DANG_HOC', from: 'SinhVien', to: 'MonHoc', title: 'Đang học môn' },
  { type: 'DANG_KY', from: 'SinhVien', to: 'HocKy', title: 'Đăng ký học kỳ' },
  { type: 'PHU_TRACH', from: 'GiangVien', to: 'ChuongTrinhDaoTao', title: 'Phụ trách chương trình' },
  { type: 'GIANG_DAY', from: 'GiangVien', to: 'MonHoc', title: 'Giảng dạy môn' },
  { type: 'GIANG_DAY_TRONG', from: 'GiangVien', to: 'HocKy', title: 'Giảng dạy trong học kỳ' },
  { type: 'MO_DANG_KY', from: 'HocKy', to: 'MonHoc', title: 'Mở đăng ký môn' },
];

export function entityBySlug(slug: string): EntityDefinition | undefined {
  return entityDefinitions.find((definition) => definition.slug === slug);
}

export function entityByLabel(label: string): EntityDefinition | undefined {
  return entityDefinitions.find((definition) => definition.label === label);
}

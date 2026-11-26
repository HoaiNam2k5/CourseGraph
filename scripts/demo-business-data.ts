import { validateBusinessData, type BusinessData } from '../packages/shared/src/data.js';

export function makeDemoBusinessData(data: BusinessData): BusinessData {
  const studentIds = new Map<string, string>();
  const lecturerIds = new Map<string, string>();

  const nodes = data.nodes.map((node) => {
    if (node.label === 'SinhVien') {
      const number = String(studentIds.size + 1).padStart(3, '0');
      const id = `DEMO-SV${number}`;
      studentIds.set(node.id, id);
      return {
        label: node.label,
        id,
        properties: {
          MaSV: id,
          HoTen: `Sinh viên mẫu ${number}`,
          NgaySinh: '2005-01-01',
          GioiTinh: 'Khác',
          Email: `sv${number}@example.invalid`,
          SDT: '0000000000',
          KhoaHoc: 'Khóa demo',
        },
      };
    }
    if (node.label === 'GiangVien') {
      const number = String(lecturerIds.size + 1).padStart(3, '0');
      const id = `DEMO-GV${number}`;
      lecturerIds.set(node.id, id);
      return {
        label: node.label,
        id,
        properties: {
          MaGV: id,
          HoTen: `Giảng viên mẫu ${number}`,
          Email: `gv${number}@example.invalid`,
          SDT: '0000000000',
          HocVi: 'Giảng viên',
        },
      };
    }
    return node;
  });

  const demoId = (label: string, id: string) => {
    if (label === 'SinhVien') return studentIds.get(id);
    if (label === 'GiangVien') return lecturerIds.get(id);
    return id;
  };
  const relationships = data.relationships.map((edge) => ({
    ...edge,
    fromId: demoId(edge.fromLabel, edge.fromId),
    toId: demoId(edge.toLabel, edge.toId),
  }));
  return validateBusinessData({ nodes, relationships });
}

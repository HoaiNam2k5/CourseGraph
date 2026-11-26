// All directions and examples match the normalized CSV baseline.

// 1. Direct prerequisites of NoSQL (MH002); MH001 is a prerequisite in source data.
MATCH (p:MonHoc)-[:TIEN_QUYET_CHO]->(m:MonHoc {MaMH: 'MH002'})
RETURN p.MaMH AS maMon, p.TenMH AS tenMon ORDER BY maMon;

// 2. Transitive prerequisites, shortest prerequisite depth for each course.
MATCH path = (p:MonHoc)-[:TIEN_QUYET_CHO*1..50]->(m:MonHoc {MaMH: 'MH002'})
RETURN p.MaMH AS maMon, p.TenMH AS tenMon, min(length(path)) AS doSau ORDER BY doSau, maMon;

// 3. Actual direct dependents of MH005: MH006, MH013, MH016. MH001 is absent.
MATCH (m:MonHoc {MaMH: 'MH005'})-[:TIEN_QUYET_CHO]->(dependent:MonHoc)
RETURN dependent.MaMH AS maMon, dependent.TenMH AS tenMon ORDER BY maMon;

// 4. Shortest directed prerequisite path between two connected source-data courses.
MATCH path = shortestPath((a:MonHoc {MaMH:'MH001'})-[:TIEN_QUYET_CHO*1..50]->(b:MonHoc {MaMH:'MH002'}))
RETURN [n IN nodes(path) | n.TenMH] AS chuoiMon, length(path) AS soCanh;

// 5. Count direct prerequisites, retaining courses with zero prerequisites.
MATCH (m:MonHoc)
OPTIONAL MATCH (p:MonHoc)-[:TIEN_QUYET_CHO]->(m)
RETURN m.MaMH AS maMon, m.TenMH AS tenMon, count(DISTINCT p) AS soTienQuyet
ORDER BY soTienQuyet DESC, maMon LIMIT 10;

// 6. Courses with the greatest transitive impact.
MATCH (m:MonHoc)-[:TIEN_QUYET_CHO*1..50]->(dependent:MonHoc)
RETURN m.MaMH AS maMon, m.TenMH AS tenMon, count(DISTINCT dependent) AS soMonPhuThuoc
ORDER BY soMonPhuThuoc DESC, maMon LIMIT 5;

// 7. Recommendations include root courses and require ALL direct/transitive prerequisites.
// Example SV001; change the business key to investigate a different student.
MATCH (s:SinhVien {MaSV: 'SV001'})
MATCH (candidate:MonHoc)
WHERE NOT EXISTS { MATCH (s)-[:DA_HOC|DANG_HOC]->(candidate) }
  AND NOT EXISTS {
    MATCH (prerequisite:MonHoc)-[:TIEN_QUYET_CHO*1..50]->(candidate)
    WHERE NOT EXISTS { MATCH (s)-[:DA_HOC]->(prerequisite) }
  }
RETURN candidate.MaMH AS maMon, candidate.TenMH AS tenMon ORDER BY maMon;

// 8. Recommendations constrained to a real student program and selected semester.
MATCH (s:SinhVien {MaSV: 'SV002'})-[:THEO_HOC]->(ct:ChuongTrinhDaoTao)-[:BAO_GOM]->(candidate:MonHoc)
MATCH (h:HocKy {MaHK:'HK002'})-[:MO_DANG_KY]->(candidate)
WHERE NOT EXISTS { MATCH (s)-[:DA_HOC|DANG_HOC]->(candidate) }
  AND NOT EXISTS {
    MATCH (prerequisite:MonHoc)-[:TIEN_QUYET_CHO*1..50]->(candidate)
    WHERE NOT EXISTS { MATCH (s)-[:DA_HOC]->(prerequisite) }
  }
RETURN DISTINCT candidate.MaMH AS maMon, candidate.TenMH AS tenMon ORDER BY maMon;

// 9. Longest prerequisite chain; bounded by the 50-course baseline graph.
MATCH path = (:MonHoc)-[:TIEN_QUYET_CHO*1..50]->(:MonHoc)
RETURN [n IN nodes(path) | n.MaMH] AS chuoiMon, length(path) AS soCanh
ORDER BY soCanh DESC LIMIT 1;

// 10. Historical consistency warnings; do not delete or rewrite historical rows.
MATCH (s:SinhVien)-[:DA_HOC]->(m:MonHoc)<-[:TIEN_QUYET_CHO]-(p:MonHoc)
WHERE NOT EXISTS { MATCH (s)-[:DA_HOC]->(p) }
RETURN s.MaSV AS maSinhVien, m.MaMH AS monDaHoc, collect(DISTINCT p.MaMH) AS tienQuyetThieu
ORDER BY maSinhVien, monDaHoc;

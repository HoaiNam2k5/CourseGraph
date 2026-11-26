// Execute statements individually in Neo4j Browser / Query, selecting the application database.

// 1. List courses.
MATCH (m:MonHoc)
RETURN m.MaMH AS maMon, m.TenMH AS tenMon, m.SoTC AS soTinChi, m.LoaiMon AS loaiMon
ORDER BY maMon LIMIT 10;

// 2. Find the real course MH005 from the source CSV.
MATCH (m:MonHoc {MaMH: 'MH005'}) RETURN m;

// 3. Business node counts (exclude application users and metadata).
MATCH (n)
WHERE any(label IN labels(n) WHERE label IN ['MonHoc','SinhVien','GiangVien','Khoa','HocKy','ChuongTrinhDaoTao'])
RETURN labels(n)[0] AS label, count(n) AS soLuong ORDER BY label;

// 4. Courses belonging to the CNTT faculty.
MATCH (m:MonHoc)-[:THUOC_KHOA]->(k:Khoa {MaKhoa: 'CNTT'})
RETURN m.MaMH AS maMon, m.TenMH AS tenMon ORDER BY maMon;

// 5. Students who completed MH005, under the declared DA_HOC demo convention.
MATCH (s:SinhVien)-[:DA_HOC]->(m:MonHoc {MaMH: 'MH005'})
RETURN s.MaSV AS maSinhVien, s.HoTen AS hoTen ORDER BY maSinhVien;

// 6. Semesters and the courses open for registration (DANG_KY is not student->course).
MATCH (h:HocKy)-[:MO_DANG_KY]->(m:MonHoc)
RETURN h.MaHK AS maHocKy, h.NamHoc AS namHoc, count(DISTINCT m) AS soMon ORDER BY maHocKy;

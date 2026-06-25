-- 0003 の初期値を適用済みの環境でも、Firebase Token 登録時の学籍番号と
-- m_student_description.f_student_id_number が一致するように補正する。
UPDATE m_student_description
SET f_student_id_number = CASE f_student_id_number
  WHEN '10000' THEN '24A001'
  WHEN '10001' THEN '24A002'
  WHEN '10002' THEN '24B001'
  WHEN '10003' THEN '24B002'
  ELSE f_student_id_number
END
WHERE f_student_id_number IN ('10000', '10001', '10002', '10003');

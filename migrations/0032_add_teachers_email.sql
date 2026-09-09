-- Microsoftの表示名(displayName)はテナント側の命名規則に依存し、
-- 学籍番号・職員番号の前置など氏名以外の要素が混ざり得るため、事前登録した
-- 教員とMicrosoftアカウントを突き合わせるキーには使えない。サインインに使う
-- アドレスを事前登録時に受け取り、これを突合キーとする。
-- 既存行と、アドレスがまだ収集できていない教員のためにNULLを許容する。
-- SQLiteはALTER TABLEでUNIQUE制約を追加できないため、UNIQUEインデックスで
-- 一意性を担保する(NULLは複数行が併存できる)。
ALTER TABLE teachers ADD COLUMN email TEXT;

CREATE UNIQUE INDEX uq_teachers_email ON teachers(email);

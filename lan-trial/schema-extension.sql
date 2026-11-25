-- Columns used by reportController.js and missing from database/schema.sql.
ALTER TABLE reports
  ADD COLUMN nurse_name VARCHAR(255) NULL,
  ADD COLUMN overtime_staff JSON NULL;
ALTER TABLE transfer_cases ADD COLUMN images LONGTEXT NULL;

-- Case layouts from the repo's fix_case_tables.js. db.js adds clinical fields and indexes.
CREATE TABLE IF NOT EXISTS surgery_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  patient_name VARCHAR(255),
  birth_year VARCHAR(50),
  address VARCHAR(255),
  admission_time VARCHAR(100),
  reason VARCHAR(255),
  preoperative_diagnosis TEXT,
  consultation_order TEXT,
  postoperative_diagnosis TEXT,
  current_status TEXT,
  images LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS death_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  patient_name VARCHAR(255),
  age VARCHAR(50),
  address VARCHAR(255),
  admission_time VARCHAR(100),
  reason VARCHAR(255),
  admission_status TEXT,
  medical_history TEXT,
  clinical_tests TEXT,
  diagnosis TEXT,
  emergency_treatment LONGTEXT,
  final_outcome TEXT,
  images LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS critical_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  patient_name VARCHAR(255),
  age VARCHAR(50),
  address VARCHAR(255),
  admission_time VARCHAR(100),
  medical_history TEXT,
  diagnosis TEXT,
  condition_summary LONGTEXT,
  treatment TEXT,
  notes TEXT,
  images LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Staff layout from setup_all_tables.js.
CREATE TABLE IF NOT EXISTS staff_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  position VARCHAR(100) NOT NULL,
  department VARCHAR(50) NOT NULL,
  certificate VARCHAR(100),
  gender ENUM('Nam', 'Nữ') DEFAULT 'Nam',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (department),
  INDEX (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

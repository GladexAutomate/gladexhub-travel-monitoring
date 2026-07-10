-- Real agent accounts, generated from the actual agents found in
-- bookings_6fbdd6b2 (name_of_agent) cross-referenced with the real employee
-- roster (employee table, boss-provided Accounts project) for employee_id.
-- team_name is each agent's majority team tag across their real bookings
-- (same logic as agentPrimaryTeam in AdminFlightManagement.jsx).
--
-- All 82 accounts share one default password: "Gladex2026!"
-- (bcrypt hash below). Tell agents to log in with their employee ID or email
-- (where known) + this password. No "change password" flow exists yet — add
-- one before this goes out widely, since everyone shares the same password
-- until they're told otherwise.
--
-- 31 agent name(s) had no exact match in the employee table
-- (spelling differences, nicknames, etc.) — these got a generated AGT-xxx
-- code instead of their real employee_id: ["Alysa Aldaya","Anthony Clemente","Ben Figueroa","Catherine Kate","Cecilia Merciales","Ced Camorongan","Colynn Crespo","Enrico Ferreros","Ethan Marcelo","Fernan Santiago","Greene Ramos","Jessa Guzman","Joana Cervantes","KL Morales","Kams Valenzuela","Kenneth Yang","Kimpoy Ebueng","Laine Munez","Marriele Lee","Mhira Maniquis","Migs Antivo","Mikhaela Budico","Noel Sunga","Ree Ann Dasmarinas","Rica Niepez","Shy Satentes","Stacy Lomanog","Stephy Rose","Tin Bo","Treb Ace Peñaflorida","Yra Talampas"]

insert into public.employeeaccount (full_name, email, employee_code, password_hash, role, team_name)
values
  ('Acy Klynne Sierra', null, '497', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'The Sales Empresses'),
  ('Aira Bernadez', null, '705', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Alliah Sunga', null, '381', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Alysa Aldaya', null, 'AGT-001', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Goal Digger'),
  ('Angela Obar', null, '150', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Corp Team'),
  ('Anna Mortalla', null, '714', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Anthony Clemente', null, 'AGT-002', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Arjay Loreto', null, '104', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Ben Figueroa', null, 'AGT-003', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Bianca Mae Timbre', null, '482', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Catherine Kate', null, 'AGT-004', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Gladex Support Account'),
  ('Cecilia Merciales', null, 'AGT-005', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Commission Accomplished'),
  ('Ced Camorongan', null, 'AGT-006', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Commission Accomplished'),
  ('Charles Lagria', null, '519', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Target Achievers'),
  ('Cheska Guinto', null, '470', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Christian Borason', null, '160', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Clarence Ocampo', null, '637', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Corp Team'),
  ('Clarice Herrera', null, '198', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Gladex Support Account'),
  ('Coleen Cabral', null, '416', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Corp Team'),
  ('Colyne Paz', null, '551', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Goal Digger'),
  ('Colynn Crespo', null, 'AGT-007', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'The Sales Empresses'),
  ('Crissel Mendoza', null, '387', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Cristine Mae Ramirez', null, '627', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Dave Angelo Rendal', null, '304', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Target Achievers'),
  ('Edmar Mendoza', null, '495', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Eleonor Dela Cruz', null, '118', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Target Achievers'),
  ('Elijah Abuan', null, '621', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Ella Ramos', null, '605', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Enrico Ferreros', null, 'AGT-008', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Target Achievers'),
  ('Ethan Marcelo', null, 'AGT-009', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Gladex Support Account'),
  ('Fernan Santiago', null, 'AGT-010', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Greene Ramos', null, 'AGT-011', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Gwynell Calamba', null, '570', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'The Sales Empresses'),
  ('Hazel Lamar', null, '537', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Henry Lim', null, '469', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Jamhel Mendoza', null, '144', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Jason Carl Santos', null, '143', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Commission Accomplished'),
  ('Jastine Jhoy Molina', null, '702', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Corp Team'),
  ('Jayrald Galleto', null, '185', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Goal Digger'),
  ('Jessa Amante', null, '507', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Jessa Guzman', null, 'AGT-012', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Goal Digger'),
  ('Joana Cervantes', null, 'AGT-013', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'The Sales Empresses'),
  ('Juliana Yabut', null, '713', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('KL Morales', null, 'AGT-014', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'The Sales Empresses'),
  ('Kams Valenzuela', null, 'AGT-015', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Commission Accomplished'),
  ('Kaylene Daluz', null, '787', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Kenneth Yang', null, 'AGT-016', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Super Awesome Mega Dream Team'),
  ('Khyla Marasigan', null, '735', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Kimberly Verdeblanco', null, '558', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Commission Accomplished'),
  ('Kimpoy Ebueng', null, 'AGT-017', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Super Awesome Mega Dream Team'),
  ('Kyla Mangao', null, '708', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Target Achievers'),
  ('Kyle Castaneda', null, '548', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Laine Munez', null, 'AGT-018', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Super Awesome Mega Dream Team'),
  ('Lester Herrera', null, '597', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Super Awesome Mega Dream Team'),
  ('Malyn Marie Morales', null, '717', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Marriele Lee', null, 'AGT-019', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Gladex Support Account'),
  ('Mary Joy De Vera', null, '370', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Mhira Maniquis', null, 'AGT-020', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Goal Digger'),
  ('Migs Antivo', null, 'AGT-021', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Commission Accomplished'),
  ('Mikhaela Budico', null, 'AGT-022', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Target Achievers'),
  ('Moriel Cruz', null, '663', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Nathan Sebastian', null, '750', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Team  Hybrid'),
  ('Niccole Anne Tambis', null, '108', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Corp Team'),
  ('Noel Sunga', null, 'AGT-023', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Goal Digger'),
  ('Paige Viray', null, '604', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Patricia Andres', null, '309', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Pauline Kate Pastorin', null, '367', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Pia De Guzman', null, '463', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Super Awesome Mega Dream Team'),
  ('Princess Jaidene Castillo', null, '170', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Ree Ann Dasmarinas', null, 'AGT-024', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Corp Team'),
  ('Rica Niepez', null, 'AGT-025', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'The Sales Empresses'),
  ('Ronace Gomez', null, '536', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Target Achievers'),
  ('Rose Ann Valle', null, '368', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Sarah Salazar', null, '302', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Gladex Support Account'),
  ('Shy Satentes', null, 'AGT-026', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Goal Digger'),
  ('Stacy Lomanog', null, 'AGT-027', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Target Achievers'),
  ('Stephy Rose', null, 'AGT-028', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'TEAM C PREMIUM'),
  ('Tin Bo', null, 'AGT-029', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Gladex Support Account'),
  ('Tracy Anne Agustin', null, '303', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3'),
  ('Treb Ace Peñaflorida', null, 'AGT-030', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Domestic Sales Manager'),
  ('Yra Talampas', null, 'AGT-031', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Corp Team'),
  ('Ysabelle Casin', null, '366', '$2b$10$rJ.ZiTwCmFA7eUuwCXxB8OFlFLGge8XSXKGppeTxSXbBSCDU/jCBq', 'agent', 'Lead Hustlers 1, 2, 3')
on conflict (employee_code) do nothing;

(() => {
  const AUTH_KEY = "chi_v1_authenticated";
  const CURRENT_USER_KEY = "chi_v1_current_user";
  const PORTAL_KEY = "chi_v1_active_portal";
  const CLASS_ID = "T01";

  // 正式測試班：10 位測試學生，每人專屬帳號與密碼（非座號、非 1005 規則）。
  // 之後收集到真實名單，只要把對應的 name 改掉即可；account / password 不必動。
  const STUDENT_SEEDS = [
    { account: "gsat01", password: "620481", name: "測試生01" },
    { account: "gsat02", password: "375192", name: "測試生02" },
    { account: "gsat03", password: "948260", name: "測試生03" },
    { account: "gsat04", password: "214785", name: "測試生04" },
    { account: "gsat05", password: "803657", name: "測試生05" },
    { account: "gsat06", password: "569013", name: "測試生06" },
    { account: "gsat07", password: "431928", name: "測試生07" },
    { account: "gsat08", password: "750364", name: "測試生08" },
    { account: "gsat09", password: "186402", name: "測試生09" },
    { account: "gsat10", password: "927540", name: "測試生10" },
  ];

  function makeStudent(seed, index) {
    const seatNo = String(index + 1).padStart(2, "0");
    return {
      role: "student",
      class_id: CLASS_ID,
      seat_no: seatNo,
      account: seed.account,
      name: seed.name,
      nickname: seed.name,
      password: seed.password,
      student_id: `${CLASS_ID}_${seatNo}`,
      storage_namespace: `${CLASS_ID}_${seatNo}`,
    };
  }

  const students = STUDENT_SEEDS.map((seed, index) => makeStudent(seed, index));
  const studentMap = new Map(students.map((student) => [student.account, student]));

  // 快速測試/展示用帳號：test / 123456。
  // 刻意不放進 students 陣列，所以導師後台名單與統計都不會算到它。
  const demoStudent = {
    role: "student",
    class_id: CLASS_ID,
    seat_no: "00",
    account: "test",
    name: "測試號",
    nickname: "測試號",
    password: "123456",
    student_id: `${CLASS_ID}_test`,
    storage_namespace: `${CLASS_ID}_test`,
    demo: true,
  };
  studentMap.set(demoStudent.account, demoStudent);
  const teacher = {
    role: "teacher",
    class_id: CLASS_ID,
    seat_no: "",
    name: "導師",
    nickname: "導師",
    student_id: `${CLASS_ID}_teacher`,
    storage_namespace: `${CLASS_ID}_teacher`,
  };

  function saveUser(user) {
    localStorage.setItem(AUTH_KEY, "yes");
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    localStorage.setItem(storageKeyForUser("chi_v1_last_login", user), new Date().toISOString());
  }

  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || "null");
    } catch {
      return null;
    }
  }

  function login(account, password, portal = "student") {
    const normalizedAccount = String(account || "").trim();
    const normalizedPassword = String(password || "");
    const activePortal = ["student", "parent", "teacher"].includes(portal) ? portal : "student";

    if (activePortal === "teacher" && normalizedAccount === "admin" && normalizedPassword === "admin") {
      localStorage.setItem(PORTAL_KEY, activePortal);
      saveUser(teacher);
      return teacher;
    }

    const student = studentMap.get(normalizedAccount);
    if (!student || student.password !== normalizedPassword) return null;
    const user = activePortal === "parent"
      ? {
          ...student,
          role: "parent",
          name: `${student.name}家長`,
          nickname: `${student.name}家長`,
        }
      : student;
    localStorage.setItem(PORTAL_KEY, activePortal);
    saveUser(user);
    return user;
  }

  function logout() {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(PORTAL_KEY);
  }

  function isLoggedIn() {
    return localStorage.getItem(AUTH_KEY) === "yes" && Boolean(getCurrentUser());
  }

  function storageKey(baseKey) {
    const user = getCurrentUser();
    return storageKeyForUser(baseKey, user);
  }

  function storageKeyForUser(baseKey, user) {
    if (!user?.storage_namespace) return baseKey;
    return baseKey.replace(/^chi_v1_/, `chi_v1_${user.storage_namespace}_`);
  }

  function displayName(user = getCurrentUser()) {
    if (!user) return "";
    if (user.role === "teacher") return `${user.class_id}班｜導師模式`;
    if (user.role === "parent") return `${user.class_id}班｜${user.seat_no}號｜${user.nickname}`;
    return `${user.class_id}班｜${user.seat_no}號｜${user.name}`;
  }

  function activePortal() {
    return localStorage.getItem(PORTAL_KEY) || getCurrentUser()?.role || "student";
  }

  window.ChiAuth = {
    classId: CLASS_ID,
    students,
    login,
    logout,
    isLoggedIn,
    getCurrentUser,
    storageKey,
    storageKeyForUser,
    displayName,
    activePortal,
  };
})();

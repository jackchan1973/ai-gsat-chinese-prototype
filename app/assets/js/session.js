(() => {
  const AUTH_KEY = "chi_v1_authenticated";
  const CURRENT_USER_KEY = "chi_v1_current_user";
  const PORTAL_KEY = "chi_v1_active_portal";
  const CLASS_ID = "1105";
  const numerals = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

  function chineseNumber(value) {
    if (value <= 10) return value === 10 ? "十" : numerals[value];
    if (value < 20) return `十${numerals[value - 10]}`;
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return `${numerals[tens]}十${ones ? numerals[ones] : ""}`;
  }

  function makeStudent(seatNumber) {
    const seatNo = String(seatNumber).padStart(2, "0");
    return {
      role: "student",
      class_id: CLASS_ID,
      seat_no: seatNo,
      name: `王${chineseNumber(seatNumber)}`,
      nickname: `王${chineseNumber(seatNumber)}`,
      password: `1005${seatNo}`,
      student_id: `${CLASS_ID}_${seatNo}`,
      storage_namespace: `${CLASS_ID}_${seatNo}`,
    };
  }

  const students = Array.from({ length: 50 }, (_, index) => makeStudent(index + 1));
  const studentMap = new Map(students.map((student) => [student.seat_no, student]));
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

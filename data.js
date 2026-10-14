/* ATTENDRIX – sample data used ONLY by the Stage 1 interface preview.
   Nothing here is real. Stage 2+ replaces this with Firebase. */
window.DEMO = {
  today: new Date(),
  user: {
    faculty: { name: 'Faculty Preview', email: 'faculty@example.com', role: 'Faculty / Admin' },
    cr:      { name: 'CR Preview',      email: 'cr@example.com',      role: 'Class Representative' },
    student: { name: 'Student Preview', email: 'student@example.com', role: 'Student' }
  },
  classes: [
    { id: 'c1', name: 'BCA Cybersecurity – Sem 1', code: '482913', students: 12, att: 86, archived: false },
    { id: 'c2', name: 'Programming in C',          code: '730154', students: 12, att: 91, archived: false },
    { id: 'c3', name: 'Digital Fundamentals',      code: '165820', students: 12, att: 79, archived: false }
  ],
  roster: [
    'Aarav Nair','Anjali Menon','Farhan Ali','Gayathri S','Hari Krishnan','Irfan Basheer',
    'Jasna P','Kiran Das','Lakshmi R','Midhun K','Nimisha T','Rahul V'
  ].map((n, i) => ({ id: 's' + (i + 1), name: n })),
  weekly: [88, 92, 81, 90, 76, 94, 86],
  weeklyLabels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  sessions: [
    { date: '2026-10-13', no: 2, cls: 'BCA Cybersecurity – Sem 1', present: 10, absent: 2 },
    { date: '2026-10-13', no: 1, cls: 'Programming in C',          present: 11, absent: 1 },
    { date: '2026-10-12', no: 1, cls: 'Digital Fundamentals',      present: 9,  absent: 3 },
    { date: '2026-10-09', no: 1, cls: 'BCA Cybersecurity – Sem 1', present: 12, absent: 0 }
  ],
  joinRequests: [
    { id: 'j1', student: 'Sneha Mohan',  cls: 'Programming in C',          status: 'Pending', when: '2026-10-13' },
    { id: 'j2', student: 'Adil Rahman',  cls: 'BCA Cybersecurity – Sem 1', status: 'Pending', when: '2026-10-13' },
    { id: 'j3', student: 'Meera Joseph', cls: 'Digital Fundamentals',      status: 'Pending', when: '2026-10-12' }
  ],
  requests: [
    { id: 'r1', title: 'Medical leave on 9 Oct', body: 'I was unwell on 9 October and could not attend the morning sessions. Please consider my absence as medical leave. I can share a certificate if needed.', cls: 'Programming in C', status: 'Pending', when: '2026-10-10', response: '' },
    { id: 'r2', title: 'Correction request for 2 Oct', body: 'I was present for session 2 but I am marked absent. I was in the lab doing the practical.', cls: 'BCA Cybersecurity – Sem 1', status: 'Approved', when: '2026-10-04', response: 'Verified with the lab record. Please see the faculty for correction.' },
    { id: 'r3', title: 'Event participation leave', body: 'Requesting leave for the inter-college event on 20 September.', cls: 'Digital Fundamentals', status: 'Rejected', when: '2026-09-18', response: 'Submit the event permission letter first.' }
  ],
  myJoin: [
    { cls: 'Programming in C', status: 'Approved', when: '2026-09-02' },
    { cls: 'Digital Fundamentals', status: 'Pending', when: '2026-10-12' },
    { cls: 'Advanced Networks', status: 'Rejected', when: '2026-09-20' }
  ],
  myAttendance: [
    { cls: 'BCA Cybersecurity – Sem 1', attended: 41, total: 48 },
    { cls: 'Programming in C',          attended: 33, total: 36 },
    { cls: 'Digital Fundamentals',      attended: 21, total: 30 }
  ],
  myHistory: [
    { date: '2026-10-13', cls: 'BCA Cybersecurity – Sem 1', no: 2, s: 'P' },
    { date: '2026-10-13', cls: 'Programming in C', no: 1, s: 'P' },
    { date: '2026-10-12', cls: 'Digital Fundamentals', no: 1, s: 'A' },
    { date: '2026-10-09', cls: 'BCA Cybersecurity – Sem 1', no: 1, s: 'P' }
  ],
  announcements: [
    { title: 'Internal exam schedule', body: 'Internal exams start on 27 October. Timetable is on the notice board.', when: '2026-10-13' },
    { title: 'Lab session moved', body: 'Friday lab is moved to 2 PM.', when: '2026-10-11' }
  ],
  notifications: [
    { text: '3 join requests are waiting for review', when: '1h ago' },
    { text: 'Attendance finalized for Programming in C', when: 'Yesterday' },
    { text: 'New announcement: Internal exam schedule', when: 'Yesterday' }
  ],
  rooms: [
    { id: 'm1', name: 'BCA Cybersecurity – Sem 1', unread: 2 },
    { id: 'm2', name: 'Programming in C', unread: 0 },
    { id: 'm3', name: 'Digital Fundamentals', unread: 1 }
  ],
  messages: [
    { who: 'Faculty Preview', me: false, text: 'Please submit the lab record by Friday.', time: '10:02' },
    { who: 'Anjali Menon', me: false, text: 'Will the record be checked in class?', time: '10:05' },
    { who: 'Faculty Preview', me: false, text: 'Yes, bring it printed.', time: '10:06' }
  ],
  audit: [
    { time: '2026-10-13 11:42', actor: 'Faculty Preview', role: 'Faculty', cls: 'c1', action: 'Finalized attendance', detail: 'Session 2 – 10 present, 2 absent' },
    { time: '2026-10-13 09:15', actor: 'Faculty Preview', role: 'Faculty', cls: 'c2', action: 'Approved join request', detail: 'Student: Sneha Mohan' },
    { time: '2026-10-12 16:03', actor: 'Faculty Preview', role: 'Faculty', cls: 'c1', action: 'Assigned Class Representative', detail: 'User: CR Preview' },
    { time: '2026-10-12 10:20', actor: 'CR Preview', role: 'CR', cls: 'c3', action: 'Added student', detail: 'Roll 12 – Rahul V' }
  ]
};

/* Real (signed-in) mode starts with NO data. Real records will come from Firestore in later stages. */
window.EMPTY_DATA = {
  classes: [], roster: [], joinRequests: [], requests: [], myJoin: [], announcements: [], messages: [],
  weekly: [], weeklyLabels: [], sessions: [], myAttendance: [], myHistory: [], rooms: [], audit: [], notifications: []
};

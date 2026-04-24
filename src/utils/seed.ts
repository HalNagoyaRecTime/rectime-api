import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 学生データ
  const students = [
    {
      studentId: 20001,
      classCode: '1A',
      attendanceNumber: 1,
      name: '田中太郎',
    },
    {
      studentId: 20002,
      classCode: '1A',
      attendanceNumber: 2,
      name: '佐藤花子',
    },
    {
      studentId: 20003,
      classCode: '1B',
      attendanceNumber: 1,
      name: '鈴木一郎',
    },
    {
      studentId: 20004,
      classCode: '1B',
      attendanceNumber: 2,
      name: '高橋美咲',
    },
    {
      studentId: 20005,
      classCode: '2A',
      attendanceNumber: 1,
      name: '山田健太',
    },
  ];

  for (const student of students) {
    await prisma.student.upsert({
      where: { studentId: student.studentId },
      update: {},
      create: student,
    });
  }

  // レクリエーションデータ
  const recreations = [
    {
      title: 'バスケットボール大会',
      description: '3on3バスケットボールトーナメント',
      location: '体育館',
      startTime: 1100,
      endTime: 1300,
      maxParticipants: 24,
      status: 'scheduled',
    },
    {
      title: '文化祭準備',
      description: '来月の文化祭に向けた展示物準備',
      location: '第1教室',
      startTime: 1400,
      endTime: 1600,
      maxParticipants: 30,
      status: 'scheduled',
    },
    {
      title: '英語スピーチコンテスト',
      description: '学年対抗英語プレゼンテーション大会',
      location: '講堂',
      startTime: 1630,
      endTime: 1800,
      maxParticipants: 50,
      status: 'scheduled',
    },
    {
      title: 'プログラミング勉強会',
      description: 'React/TypeScript実践セッション',
      location: 'PC教室',
      startTime: 1900,
      endTime: 2100,
      maxParticipants: 20,
      status: 'scheduled',
    },
  ];

  const createdRecreations = [];
  for (const recreation of recreations) {
    const created = await prisma.recreation.create({
      data: recreation,
    });
    createdRecreations.push(created);
  }

  // 参加データ
  const participations = [
    {
      studentId: 20001,
      recreationId: createdRecreations[0].recreationId,
      status: 'registered',
    },
    {
      studentId: 20002,
      recreationId: createdRecreations[0].recreationId,
      status: 'registered',
    },
    {
      studentId: 20003,
      recreationId: createdRecreations[1].recreationId,
      status: 'registered',
    },
    {
      studentId: 20004,
      recreationId: createdRecreations[1].recreationId,
      status: 'registered',
    },
    {
      studentId: 20005,
      recreationId: createdRecreations[2].recreationId,
      status: 'registered',
    },
    {
      studentId: 20001,
      recreationId: createdRecreations[2].recreationId,
      status: 'registered',
    },
  ];

  for (const participation of participations) {
    await prisma.participation.upsert({
      where: {
        studentId_recreationId: {
          studentId: participation.studentId,
          recreationId: participation.recreationId,
        },
      },
      update: {},
      create: participation,
    });
  }
}

main().catch(() => {});

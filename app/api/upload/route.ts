import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';
import multer from 'multer';

export const config = {
  api: {
    bodyParser: false,
  },
};

const uploadDir = path.join(process.cwd(), 'public/uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  });
  
  const upload = multer({ storage });

export  async function POST(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

   if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error uploading the file' });
    }

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = path.join('/uploads', file.filename);
    const userId = req.body.userId;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    try {
      await prisma.user.update({
        where: { id: userId },
        data: { image: filePath },
      });

      res.status(200).json({ filePath });
    } catch (dbError) {
      console.error(dbError);
      res.status(500).json({ error: 'Error saving file path to database' });
    }
  });
}

import { Router } from 'express';
import { upload } from '../config/upload.js';
import { extrairDadosPDF } from '../controller/danfeController.js';

const router = Router();

// Endpoint de extração via upload de PDF
router.post('/extrair-pdf', upload.single('pdfFile'), extrairDadosPDF);

export default router;
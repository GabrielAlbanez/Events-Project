import { Router } from 'express';

const router = Router();

// Exemplo de rota para /myEvents
router.get('/myEvents', (req, res) => {
  res.send('Hello from /myEvents!');
});

export default router;

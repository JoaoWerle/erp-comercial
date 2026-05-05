const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'erp_super_secret_key_2026';

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ error: 'Nenhum token fornecido' });

    const token = authHeader.split(' ')[1]; // "Bearer TOKEN"
    if (!token) return res.status(403).json({ error: 'Token malformado' });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Token inválido ou expirado' });
        
        req.user = decoded;
        next();
    });
};

module.exports = { verifyToken, JWT_SECRET };

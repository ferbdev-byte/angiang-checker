module.exports = (req, res) => {
    const config = {
        url: process.env.SUPABASE_URL || '',
        anonKey: process.env.SUPABASE_ANON_KEY || ''
    };

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(`window.__SUPABASE_CONFIG__ = ${JSON.stringify(config)};`);
};

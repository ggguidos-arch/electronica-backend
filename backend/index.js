require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const conexion = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10
});

// ==========================================
// 📊 DASHBOARD & MÉTRICAS
// ==========================================
app.get('/dashboard', (req, res) => {
  const queryIngresos = 'SELECT COALESCE(SUM(v.cantidad * p.precio), 0) AS totalIngresos, COUNT(v.id) AS totalVentas FROM ventas v INNER JOIN productos p ON v.producto_id = p.id';
  const queryClientes = 'SELECT COUNT(id) AS totalClientes FROM clientes';
  const queryBajoStock = 'SELECT COUNT(id) AS productosBajoStock FROM productos WHERE stock <= 5';

  conexion.query(queryIngresos, (err, r1) => {
    if (err) return res.status(500).json(err);
    conexion.query(queryClientes, (err2, r2) => {
      if (err2) return res.status(500).json(err2);
      conexion.query(queryBajoStock, (err3, r3) => {
        if (err3) return res.status(500).json(err3);
        res.json({
          totalIngresos: r1[0].totalIngresos,
          totalVentas: r1[0].totalVentas,
          totalClientes: r2[0].totalClientes,
          productosBajoStock: r3[0].productosBajoStock
        });
      });
    });
  });
});

// ==========================================
// 📦 MÓDULO DE PRODUCTOS (INVENTARIO)
// ==========================================
app.get('/productos', (req, res) => {
  conexion.query('SELECT * FROM productos ORDER BY id DESC', (err, r) => {
    if (err) return res.status(500).json(err);
    res.json(r);
  });
});

app.post('/productos', (req, res) => {
  const { nombre, categoria, precio, stock } = req.body;
  const sql = 'INSERT INTO productos (nombre, categoria, precio, stock) VALUES (?, ?, ?, ?)';
  conexion.query(sql, [nombre, categoria || 'General', precio, stock || 0], (err, r) => {
    if (err) return res.status(500).json(err);
    res.json({ message: 'Producto agregado exitosamente', id: r.insertId });
  });
});

app.put('/productos/:id', (req, res) => {
  const { id } = req.params;
  const { nombre, categoria, precio, stock } = req.body;
  const sql = 'UPDATE productos SET nombre=?, categoria=?, precio=?, stock=? WHERE id=?';
  conexion.query(sql, [nombre, categoria, precio, stock, id], (err) => {
    if (err) return res.status(500).json(err);
    res.json({ message: 'Producto actualizado exitosamente' });
  });
});

app.delete('/productos/:id', (req, res) => {
  const { id } = req.params;
  conexion.query('DELETE FROM productos WHERE id=?', [id], (err) => {
    if (err) return res.status(500).json(err);
    res.json({ message: 'Producto eliminado' });
  });
});

// ==========================================
// 👥 MÓDULO DE CLIENTES
// ==========================================
app.get('/clientes', (req, res) => {
  conexion.query('SELECT * FROM clientes ORDER BY id DESC', (err, r) => {
    if (err) return res.status(500).json(err);
    res.json(r);
  });
});

app.post('/clientes', (req, res) => {
  const { nombre, telefono, email } = req.body;
  conexion.query('INSERT INTO clientes (nombre, telefono, email) VALUES (?, ?, ?)', [nombre, telefono, email], (err, r) => {
    if (err) return res.status(500).json(err);
    res.json({ message: 'Cliente registrado', id: r.insertId });
  });
});

app.put('/clientes/:id', (req, res) => {
  const { id } = req.params;
  const { nombre, telefono, email } = req.body;
  conexion.query('UPDATE clientes SET nombre=?, telefono=?, email=? WHERE id=?', [nombre, telefono, email, id], (err) => {
    if (err) return res.status(500).json(err);
    res.json({ message: 'Cliente actualizado' });
  });
});

app.delete('/clientes/:id', (req, res) => {
  const { id } = req.params;
  conexion.query('DELETE FROM clientes WHERE id=?', [id], (err) => {
    if (err) return res.status(500).json(err);
    res.json({ message: 'Cliente eliminado' });
  });
});

// ==========================================
// 🛒 MÓDULO DE VENTAS (CON DESCUENTO DE STOCK)
// ==========================================
app.get('/ventas', (req, res) => {
  const sql = `
    SELECT v.id, c.nombre AS cliente, p.nombre AS producto, p.precio, v.cantidad, v.fecha, 
           (v.cantidad * p.precio) AS total, v.cliente_id, v.producto_id 
    FROM ventas v
    INNER JOIN clientes c ON v.cliente_id = c.id
    INNER JOIN productos p ON v.producto_id = p.id
    ORDER BY v.id DESC
  `;
  conexion.query(sql, (err, r) => {
    if (err) return res.status(500).json(err);
    res.json(r);
  });
});

app.post('/ventas', (req, res) => {
  const { cliente_nombre, producto_id, cantidad, fecha } = req.body;

  // 1. Verificar si hay stock suficiente en el producto
  conexion.query('SELECT stock FROM productos WHERE id = ?', [producto_id], (err, prodRes) => {
    if (err) return res.status(500).json(err);
    if (prodRes.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });

    const stockActual = prodRes[0].stock;
    if (stockActual < cantidad) {
      return res.status(400).json({ error: `Stock insuficiente. Solo quedan ${stockActual} unidades disponibles.` });
    }

    // 2. Buscar o crear el cliente
    conexion.query('SELECT id FROM clientes WHERE nombre = ?', [cliente_nombre], (err2, clientRes) => {
      if (err2) return res.status(500).json(err2);

      if (clientRes.length > 0) {
        crearVentaYDescontarStock(clientRes[0].id);
      } else {
        conexion.query('INSERT INTO clientes (nombre, telefono, email) VALUES (?, ?, ?)', [cliente_nombre, 'Sin teléfono', 'cliente@techstore.com'], (err3, nuevoCli) => {
          if (err3) return res.status(500).json(err3);
          crearVentaYDescontarStock(nuevoCli.insertId);
        });
      }
    });

    // 3. Registrar venta y restar del inventario
    function crearVentaYDescontarStock(c_id) {
      conexion.query('INSERT INTO ventas (cliente_id, producto_id, cantidad, fecha) VALUES (?, ?, ?, ?)', [c_id, producto_id, cantidad, fecha], (errV) => {
        if (errV) return res.status(500).json(errV);

        conexion.query('UPDATE productos SET stock = stock - ? WHERE id = ?', [cantidad, producto_id], (errS) => {
          if (errS) return res.status(500).json(errS);
          res.json({ message: '¡Venta registrada e inventario actualizado!' });
        });
      });
    }
  });
});

app.delete('/ventas/:id', (req, res) => {
  const { id } = req.params;
  // Obtener producto y cantidad antes de borrar para reponer el stock
  conexion.query('SELECT producto_id, cantidad FROM ventas WHERE id = ?', [id], (err, r) => {
    if (!err && r.length > 0) {
      const { producto_id, cantidad } = r[0];
      conexion.query('UPDATE productos SET stock = stock + ? WHERE id = ?', [cantidad, producto_id]);
    }
    conexion.query('DELETE FROM ventas WHERE id = ?', [id], (err2) => {
      if (err2) return res.status(500).json(err2);
      res.json({ message: 'Venta cancelada y stock restaurado' });
    });
  });
});

app.listen(PORT, () => console.log(`TechStore API corriendo en puerto ${PORT}`));

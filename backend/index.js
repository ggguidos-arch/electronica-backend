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

app.get('/clientes', (req, res) => {
  conexion.query('SELECT * FROM clientes', (err, r) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(r);
    }
  });
});

app.get('/productos', (req, res) => {
  conexion.query('SELECT * FROM productos', (err, r) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(r);
    }
  });
});

app.get('/ventas', (req, res) => {
  const sql = `
    SELECT v.id, c.nombre AS cliente, p.nombre AS producto, v.cantidad, v.fecha, p.precio, (v.cantidad * p.precio) AS total, v.cliente_id, v.producto_id 
    FROM ventas v
    INNER JOIN clientes c ON v.cliente_id = c.id
    INNER JOIN productos p ON v.producto_id = p.id
  `;
  conexion.query(sql, (err, r) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(r);
    }
  });
});

app.post('/ventas', (req, res) => {
  const { cliente_nombre, producto_id, cantidad, fecha } = req.body;
  
  conexion.query('SELECT id FROM clientes WHERE nombre = ?', [cliente_nombre], (err, results) => {
    if (err) return res.status(500).send(err);
    
    if (results.length > 0) {
      registrarVenta(results[0].id);
    } else {
      conexion.query('INSERT INTO clientes (nombre, telefono) VALUES (?, ?)', [cliente_nombre, 'Sin registrar'], (err, result) => {
        if (err) return res.status(500).send(err);
        registrarVenta(result.insertId);
      });
    }
  });

  function registrarVenta(c_id) {
    conexion.query('INSERT INTO ventas (cliente_id, producto_id, cantidad, fecha) VALUES (?, ?, ?, ?)', [c_id, producto_id, cantidad, fecha], (err) => {
      if (err) {
        res.status(500).send(err);
      } else {
        res.send({ message: 'Venta registrada con éxito' });
      }
    });
  }
});

app.put('/ventas/:id', (req, res) => {
  const id = req.params.id;
  const { cliente_nombre, producto_id, cantidad, fecha } = req.body;
  
  conexion.query('SELECT id FROM clientes WHERE nombre = ?', [cliente_nombre], (err, results) => {
    if (err) return res.status(500).send(err);
    
    if (results.length > 0) {
      actualizarVenta(results[0].id);
    } else {
      conexion.query('INSERT INTO clientes (nombre, telefono) VALUES (?, ?)', [cliente_nombre, 'Sin registrar'], (err, result) => {
        if (err) return res.status(500).send(err);
        actualizarVenta(result.insertId);
      });
    }
  });

  function actualizarVenta(c_id) {
    conexion.query('UPDATE ventas SET cliente_id=?, producto_id=?, cantidad=?, fecha=? WHERE id=?', [c_id, producto_id, cantidad, fecha, id], (err) => {
      if (err) {
        res.status(500).send(err);
      } else {
        res.send({ message: `Venta actualizada` });
      }
    });
  }
});

app.delete('/ventas/:id', (req, res) => {
  const id = req.params.id;
  conexion.query('DELETE FROM ventas WHERE id=?', [id], (err) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.send({ message: `Venta eliminada` });
    }
  });
});

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
  });
});

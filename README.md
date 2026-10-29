# tools

Panel local en HTML, CSS y JavaScript. Sin servidor y sin conexión a Internet.
Las únicas librerías externas (node-forge y JSZip, para el generador de certificados) están en `js/vendor`.

## Cómo usarlo

1. Descomprime la carpeta donde quieras (por ejemplo `Documentos/tools`).
2. Abre `index.html` con Chrome o Edge (doble clic).
3. Guárdalo en favoritos para tenerlo a mano.

Atajo: **Ctrl+K** para buscar cualquier sección.

## Links

Los links se leen de `links.json`, en la misma carpeta que `index.html`. Para añadir, cambiar o borrar links, edita ese archivo:

```json
{
  "categorias": [
    {
      "nombre": "Apigee",
      "links": [
        { "nombre": "Apigee UI", "url": "https://apigee.google.com" }
      ]
    }
  ]
}
```

- Las categorías y los links salen en el mismo orden que en el archivo.
- Si el JSON tiene un error, la página dice cuál.

Al abrir `index.html` con doble clic, el navegador no deja que la página lea `links.json` por sí sola.
La primera vez te pide que elijas el archivo y guarda una copia. Cuando lo cambies, pulsa **recargar links.json** y elígelo de nuevo.
Si sirves la carpeta desde un servidor local (`http://localhost/...`), se lee solo cada vez que entras en la sección.

## Topologías AWS y otros datos

Las topologías se guardan en el navegador. Si el navegador lo permite, puedes elegir además un archivo JSON (abajo a la izquierda) y cada cambio se escribe en él.
Si no lo permite (por ejemplo, por una política de empresa), usa **exportar .json** para descargar una copia e **importar** para cargarla.

## Secciones

| Sección | Qué hace |
|---|---|
| Links y AWS | Links leídos de `links.json`, con filtro por categoría y búsqueda; topologías de AWS (VPC, CIDR, subredes, diagrama) |
| PEM | Quita cabeceras y deja el cuerpo en una línea, PEM con `\n`, o reconstruye el PEM |
| Base64 / Basic Auth | Codifica/decodifica Base64 (UTF-8, Base64URL, archivos) y genera o decodifica cabeceras `Authorization: Basic` |
| JWT | Decodifica, verifica (HS/RS/PS/ES con secreto, PEM, certificado o JWK) y firma tokens |
| Comparador de texto | Diff lado a lado o unificado, con resaltado dentro de la línea y normalización de JSON |
| CSR / certificados | Decodifica CSR, certificados y cadenas; huellas; comprueba si una clave privada corresponde |
| Generar certificados | Certificados autofirmados RSA 2048 para uno o varios dominios; exporta .p12, .jks o ZIP con .crt, .key y .csr |
| Validador JSON | Valida con línea, columna y pista del error; formatea, minifica, ordena claves y quita escapes |

## Añadir una sección nueva

Crea un `js/mi-seccion.js`, inclúyelo en `index.html` antes de `App.start()` y registra:

```js
App.register({
  id: 'mi-seccion', title: 'Mi sección', sub: 'subtítulo', group: 'Herramientas',
  render(view) { view.innerHTML = '<div class="card">Hola</div>'; },
});
```

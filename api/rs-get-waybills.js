const https = require("https");
const { parseStringPromise } = require("xml2js");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Only GET allowed" });
    return;
  }

  const RS_USER = process.env.RS_USER;
  const RS_PASS = process.env.RS_PASS;

  if (!RS_USER || !RS_PASS) {
    res.status(500).json({ error: "RS_USER or RS_PASS missing" });
    return;
  }

  const fromDate = "2025-01-01";
  const toDate = "2025-12-31";

  const soapBody = `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <get_waybills_v1 xmlns="http://tempuri.org/">
          <su>${RS_USER}</su>
          <sp>${RS_PASS}</sp>
          <from>${fromDate}</from>
          <to>${toDate}</to>
        </get_waybills_v1>
      </soap:Body>
    </soap:Envelope>
  `.trim();

  const options = {
    hostname: "services.rs.ge",
    path: "/WayBillService/WayBillService.asmx",
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Content-Length": Buffer.byteLength(soapBody),
      "SOAPAction": "http://tempuri.org/get_waybills_v1"
    }
  };

  try {
    const xml = await soapRequest(options, soapBody);
    const data = await parseStringPromise(xml, { explicitArray: true });

    let items = [];

    try {
      const body =
        data["soap:Envelope"]["soap:Body"][0]["get_waybills_v1Response"][0]["get_waybills_v1Result"][0];

      const waybills = body.Waybills?.[0]?.Waybill || [];

      waybills.forEach((wb) => {
        const details = wb.Details?.[0]?.Detail || [];

        details.forEach((d) => {
          const barcode = d.NomenclatureBarCode?.[0] || "";
          const name = d.NomenclatureName?.[0] || "";
          const qty = parseFloat(d.Quantity?.[0] || "0");
          const price = parseFloat(d.Price?.[0] || "0");

          if (barcode && name) {
            items.push({ barcode, name, qty, price });
          }
        });
      });
    } catch (e) {
      console.error("PARSE ERROR:", e);
    }

    res.status(200).json(items);
  } catch (err) {
    res.status(500).json({ error: "SOAP request failed", details: String(err) });
  }
};

function soapRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

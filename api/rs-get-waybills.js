const https = require("https");
const { parseStringPromise } = require("xml2js");

module.exports = async (req, res) => {
  const RS_USER = process.env.RS_USER;
  const RS_PASS = process.env.RS_PASS;

  if (!RS_USER || !RS_PASS) {
    res.status(500).json({ error: "RS_USER or RS_PASS missing" });
    return;
  }

  const today = new Date();
  const fromDate = "2024-01-01";
  const toDate = "2030-01-01";

  const soapBody = `
  <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                 xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <get_received_waybills_v1 xmlns="http://tempuri.org/">
        <su>${RS_USER}</su>
        <sp>${RS_PASS}</sp>
        <from>${fromDate}</from>
        <to>${toDate}</to>
      </get_received_waybills_v1>
    </soap:Body>
  </soap:Envelope>`.trim();

  const options = {
    hostname: "services.rs.ge",
    path: "/WayBillService/WayBillService.asmx",
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Content-Length": Buffer.byteLength(soapBody),
      "SOAPAction": "http://tempuri.org/get_received_waybills_v1"
    }
  };

  try {
    const xml = await requestSOAP(options, soapBody);
    const json = await parseStringPromise(xml, { explicitArray: true });

    let result = [];

    const body =
      json["soap:Envelope"]["soap:Body"][0]["get_received_waybills_v1Response"][0]["get_received_waybills_v1Result"][0];

    const waybills = body.Waybills?.[0]?.Waybill || [];

    waybills.forEach(wb => {
      const details = wb.Details?.[0]?.Detail || [];

      details.forEach(d => {
        result.push({
          barcode: d.NomenclatureBarCode?.[0] || "",
          name: d.NomenclatureName?.[0] || "",
          qty: parseFloat(d.Quantity?.[0] || "0"),
          price: parseFloat(d.Price?.[0] || "0"),
          supplier: wb.ProviderName?.[0] || "",
          waybill_number: wb.WayBillNumber?.[0] || "",
          waybill_date: wb.WayBillDate?.[0] || ""
        });
      });
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "SOAP error", details: err.toString() });
  }
};

function requestSOAP(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => resolve(data));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

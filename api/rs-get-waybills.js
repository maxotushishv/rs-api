const https = require("https");
const { parseStringPromise } = require("xml2js");

module.exports = async (req, res) => {
  const RS_USER = process.env.RS_USER;
  const RS_PASS = process.env.RS_PASS;

  if (!RS_USER || !RS_PASS) {
    return res.status(500).json({ error: "Missing RS_USER or RS_PASS" });
  }

  try {
    // STEP 1 — GET BUYER HEADERS
    const headersXML = await callRS(
      `
      <get_buyer_waybills_ex xmlns="http://tempuri.org/">
        <su>${RS_USER}</su>
        <sp>${RS_PASS}</sp>

        <!-- აქ 3 პარამეტრი ჩავამატეთ, რომელიც აუცილებელია RS.gov-ზე! -->

        <begin_date_s>2000-01-01T00:00:00</begin_date_s>
        <begin_date_e>2030-01-01T00:00:00</begin_date_e>

        <create_date_s>2000-01-01T00:00:00</create_date_s>
        <create_date_e>2030-01-01T00:00:00</create_date_e>

      </get_buyer_waybills_ex>
    `,
      "http://tempuri.org/get_buyer_waybills_ex"
    );

    const json = await parseStringPromise(headersXML, { explicitArray: true });

    const body =
      json["soap:Envelope"]["soap:Body"][0][
        "get_buyer_waybills_exResponse"
      ][0]["get_buyer_waybills_exResult"][0];

    const list = body.Waybills?.[0]?.Waybill || [];

    let final = [];

    // STEP 2 — FOR EACH WAYBILL, GET GOODS
    for (const wb of list) {
      const num = wb.WayBillNumber?.[0] || "";
      const supplier = wb.ProviderName?.[0] || "";
      const date = wb.WayBillDate?.[0] || "";

      const goodsXML = await callRS(
        `
        <get_buyer_waybilll_goods_list xmlns="http://tempuri.org/">
          <su>${RS_USER}</su>
          <sp>${RS_PASS}</sp>
          <waybill_number>${num}</waybill_number>
        </get_buyer_waybilll_goods_list>
      `,
        "http://tempuri.org/get_buyer_waybilll_goods_list"
      );

      const goodsJSON = await parseStringPromise(goodsXML, { explicitArray: true });

      const gbody =
        goodsJSON["soap:Envelope"]["soap:Body"][0][
          "get_buyer_waybilll_goods_listResponse"
        ][0]["get_buyer_waybilll_goods_listResult"][0];

      const goods = gbody.Goods?.[0]?.Good || [];

      final.push({
        number: num,
        supplier,
        date,
        items: goods.map(g => ({
          barcode: g.BarCode?.[0] || "",
          name: g.Name?.[0] || "",
          qty: Number(g.Quantity?.[0] || 0),
          price: Number(g.Price?.[0] || 0)
        }))
      });
    }

    res.json(final);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
};

function callRS(bodyInner, action) {
  const xml = `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>${bodyInner}</soap:Body>
    </soap:Envelope>
  `.trim();

  const opts = {
    hostname: "services.rs.ge",
    path: "/WayBillService/WayBillService.asmx",
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Content-Length": Buffer.byteLength(xml),
      SOAPAction: action
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      let data = "";
      res.on("data", ch => (data += ch));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.write(xml);
    req.end();
  });
}

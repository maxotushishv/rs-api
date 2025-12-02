const https = require("https");
const { parseStringPromise } = require("xml2js");

module.exports = async (req, res) => {
  const RS_USER = process.env.RS_USER;
  const RS_PASS = process.env.RS_PASS;

  if (!RS_USER || !RS_PASS) {
    return res.status(500).json({ error: "RS_USER or RS_PASS missing" });
  }

  try {
    // STEP 1) შემოსული ზედნადებების სიის წამოღება
    const listXML = await callRS(`
      <get_buyer_waybills_ex xmlns="http://tempuri.org/">
        <su>${RS_USER}</su>
        <sp>${RS_PASS}</sp>
      </get_buyer_waybills_ex>
    `, "http://tempuri.org/get_buyer_waybills_ex");

    const listJSON = await parseStringPromise(listXML, { explicitArray: true });

    const body =
      listJSON["soap:Envelope"]["soap:Body"][0]["get_buyer_waybills_exResponse"][0]["get_buyer_waybills_exResult"][0];

    const waybills = body.Waybills?.[0]?.Waybill || [];

    let final = [];

    // STEP 2) თითო ზედნადების საქონლის წამოღება
    for (let wb of waybills) {
      const number = wb.WayBillNumber?.[0];
      const supplier = wb.ProviderName?.[0];
      const date = wb.WayBillDate?.[0];

      // Now Fetch items
      const goodsXML = await callRS(`
        <get_buyer_waybilll_goods_list xmlns="http://tempuri.org/">
          <su>${RS_USER}</su>
          <sp>${RS_PASS}</sp>
          <waybill_number>${number}</waybill_number>
        </get_buyer_waybilll_goods_list>
      `, "http://tempuri.org/get_buyer_waybilll_goods_list");

      const goodsJSON = await parseStringPromise(goodsXML, { explicitArray: true });

      const gbody =
        goodsJSON["soap:Envelope"]["soap:Body"][0]["get_buyer_waybilll_goods_listResponse"][0]["get_buyer_waybilll_goods_listResult"][0];

      const goods = gbody.Goods?.[0]?.Good || [];

      const items = goods.map(g => ({
        barcode: g.BarCode?.[0] || "",
        name: g.Name?.[0] || "",
        qty: parseFloat(g.Quantity?.[0] || "0"),
        price: parseFloat(g.Price?.[0] || "0"),
      }));

      final.push({
        waybill_number: number || "",
        supplier: supplier || "",
        date: date || "",
        items
      });
    }

    return res.json(final);

  } catch (err) {
    return res.status(500).json({ error: "SOAP Error", details: err.toString() });
  }
};


function callRS(innerXML, action) {
  const soapBody = `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        ${innerXML}
      </soap:Body>
    </soap:Envelope>`.trim();

  const options = {
    hostname: "services.rs.ge",
    path: "/WayBillService/WayBillService.asmx",
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Content-Length": Buffer.byteLength(soapBody),
      "SOAPAction": action
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = "";
      res.on("data", d => (data += d));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.write(soapBody);
    req.end();
  });
}

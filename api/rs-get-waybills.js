const https = require("https");
const { parseStringPromise } = require("xml2js");

module.exports = async (req, res) => {

  const RS_USER = process.env.RS_USER;
  const RS_PASS = process.env.RS_PASS;

  if (!RS_USER || !RS_PASS) {
    return res.status(500).json({ error: "Missing RS_USER or RS_PASS" });
  }

  try {
    // STEP 1 — მიიღე ყველა მიღებული ზედნადების HEADER
    const waybillsXML = await sendSOAP(`
      <get_buyer_waybills_ex xmlns="http://tempuri.org/">
        <su>${RS_USER}</su>
        <sp>${RS_PASS}</sp>
      </get_buyer_waybills_ex>
    `, "http://tempuri.org/get_buyer_waybills_ex");

    const waybillsJSON = await parseStringPromise(waybillsXML, { explicitArray: true });

    const body =
      waybillsJSON["soap:Envelope"]["soap:Body"][0]
      ["get_buyer_waybills_exResponse"][0]
      ["get_buyer_waybills_exResult"][0];

    const waybillList = body.Waybills?.[0]?.Waybill || [];

    let result = [];

    // STEP 2 — თითო ზედნადების საქონლის სია (items) მოვიტანოთ
    for (let wb of waybillList) {
      let number = wb.WayBillNumber?.[0] || "";
      let date = wb.WayBillDate?.[0] || "";
      let supplier = wb.ProviderName?.[0] || "";

      // წამოიღე საქონელი
      const goodsXML = await sendSOAP(`
        <get_buyer_waybilll_goods_list xmlns="http://tempuri.org/">
          <su>${RS_USER}</su>
          <sp>${RS_PASS}</sp>
          <waybill_number>${number}</waybill_number>
        </get_buyer_waybilll_goods_list>
      `, "http://tempuri.org/get_buyer_waybilll_goods_list");

      const goodsJSON = await parseStringPromise(goodsXML, { explicitArray: true });

      const goodsBody =
        goodsJSON["soap:Envelope"]["soap:Body"][0]
        ["get_buyer_waybilll_goods_listResponse"][0]
        ["get_buyer_waybilll_goods_listResult"][0];

      const goods = goodsBody.Goods?.[0]?.Good || [];

      const items = goods.map(i => ({
        barcode: i.BarCode?.[0] || "",
        name: i.Name?.[0] || "",
        qty: parseFloat(i.Quantity?.[0] || "0"),
        price: parseFloat(i.Price?.[0] || "0")
      }));

      result.push({
        waybill_number: number,
        date,
        supplier,
        items
      });
    }

    return res.json(result);

  } catch (err) {
    return res.status(500).json({
      error: "SOAP ERROR",
      details: err.toString()
    });
  }
};


function sendSOAP(innerXML, action) {
  const xml = `
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>${innerXML}</soap:Body>
    </soap:Envelope>`.trim();

  const opt = {
    hostname: "services.rs.ge",
    path: "/WayBillService/WayBillService.asmx",
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Content-Length": Buffer.byteLength(xml),
      "SOAPAction": action
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(opt, res => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.write(xml);
    req.end();
  });
}

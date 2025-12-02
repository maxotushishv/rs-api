const https = require("https");
const { parseStringPromise } = require("xml2js");

const TIN = "426542495"; // შენი კომპანიის TIN

module.exports = async (req, res) => {
  const RS_USER = process.env.RS_USER;
  const RS_PASS = process.env.RS_PASS;

  if (!RS_USER || !RS_PASS) {
    return res.status(500).json({ error: "RS_USER or RS_PASS missing" });
  }

  // დიდი დიაპაზონი რათა ყველა ზედნადები წამოვიღოთ
  const fromDate = "2020-01-01";
  const toDate = "2030-12-31";

  try {
    // 1) ვიღებთ ყველა შემოსული ზედნადებების სიას
    const buyerListXML = await soapRequest(`
      <get_buyer_waybills_ex xmlns="http://tempuri.org/">
        <su>${RS_USER}</su>
        <sp>${RS_PASS}</sp>
        <tin>${TIN}</tin>
        <from>${fromDate}</from>
        <to>${toDate}</to>
      </get_buyer_waybills_ex>
    `, "http://tempuri.org/get_buyer_waybills_ex");

    const buyerJson = await parseStringPromise(buyerListXML, { explicitArray: true });

    const body =
      buyerJson["soap:Envelope"]["soap:Body"][0]["get_buyer_waybills_exResponse"][0]["get_buyer_waybills_exResult"][0];

    const waybills = body.Waybills?.[0]?.Waybill || [];

    let result = [];

    // 2) თითო ზედნადებისთვის ვიღებთ საქონლის ჩამონათვალს
    for (const wb of waybills) {
      const number = wb.WayBillNumber?.[0];
      const date = wb.WayBillDate?.[0];
      const supplier = wb.ProviderName?.[0];

      // მეორე API کالით ვიღებთ ნივთებს
      const itemsXML = await soapRequest(`
        <get_buyer_waybilll_goods_list xmlns="http://tempuri.org/">
          <su>${RS_USER}</su>
          <sp>${RS_PASS}</sp>
          <tin>${TIN}</tin>
          <waybill_number>${number}</waybill_number>
        </get_buyer_waybilll_goods_list>
      `, "http://tempuri.org/get_buyer_waybilll_goods_list");

      const itemsJSON = await parseStringPromise(itemsXML, { explicitArray: true });

      const goodsBody =
        itemsJSON["soap:Envelope"]["soap:Body"][0]["get_buyer_waybilll_goods_listResponse"][0]["get_buyer_waybilll_goods_listResult"][0];

      const goods = goodsBody.Goods?.[0]?.Good || [];

      const items = goods.map(g => ({
        barcode: g.BarCode?.[0] || "",
        name: g.Name?.[0] || "",
        qty: parseFloat(g.Quantity?.[0] || "0"),
        price: parseFloat(g.Price?.[0] || "0")
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
    return res.status(500).json({ error: "SOAP ERROR", details: err.toString() });
  }
};

// SOAP requester
function soapRequest(innerXML, soapAction) {
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
      "SOAPAction": soapAction
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.write(soapBody);
    req.end();
  });
}

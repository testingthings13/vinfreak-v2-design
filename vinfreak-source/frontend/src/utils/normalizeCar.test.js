import assert from "assert";
import { normalizeCar } from "./normalizeCar.js";

const car = normalizeCar({ location_address: "Dallas, TX 75230" });
assert.strictEqual(car.location_address, "Dallas, TX");
assert.strictEqual(car.__location, "Dallas, TX");

const fallbackCity = normalizeCar({ location: " ", city: "Austin", state: "TX" });
assert.strictEqual(fallbackCity.__location, "Austin, TX");

const fallbackAddress = normalizeCar({ location: "", location_address: "Miami, FL 33101", city: "Miami", state: "FL" });
assert.strictEqual(fallbackAddress.location_address, "Miami, FL");
assert.strictEqual(fallbackAddress.__location, "Miami, FL");

const dealershipLocationOnly = normalizeCar({ dealership: { location: "City, ST" } });
assert.strictEqual(dealershipLocationOnly.__location, "City, ST");

const streetAddress = normalizeCar({ location_address: "1880 136th Pl NE, Bellevue, WA" });
assert.strictEqual(streetAddress.location_address, "Bellevue, WA");
assert.strictEqual(streetAddress.__location, "Bellevue, WA");

const spelledState = normalizeCar({ city: "Philadelphia", state: "Pennsylvania" });
assert.strictEqual(spelledState.state, "PA");
assert.strictEqual(spelledState.__location, "Philadelphia, PA");
assert.strictEqual(spelledState.city, "Philadelphia");

const derivedFromLocation = normalizeCar({ location: "Novato, CA" });
assert.strictEqual(derivedFromLocation.city, "Novato");
assert.strictEqual(derivedFromLocation.state, "CA");
assert.strictEqual(derivedFromLocation.__location, "Novato, CA");

const spelledAddress = normalizeCar({ location_address: "Las Vegas, Nevada" });
assert.strictEqual(spelledAddress.location_address, "Las Vegas, NV");
assert.strictEqual(spelledAddress.__location, "Las Vegas, NV");
assert.strictEqual(spelledAddress.city, "Las Vegas");
assert.strictEqual(spelledAddress.state, "NV");

const tesla = normalizeCar({
  make: "Tesla",
  make_id: 42,
  make_rel: { id: 42, name: "Tesla", logo_url: "/logos/tesla.png" },
});
assert.strictEqual(tesla.make_rel.logo_url, "https://vinfreak.onrender.com/logos/tesla.png");
assert.strictEqual(tesla.__makeLogo, "https://vinfreak.onrender.com/logos/tesla.png");
assert.strictEqual(tesla.make_id, 42);

const withImages = normalizeCar({
  images: [" /img.jpg ", "/img.jpg", "https://vinfreak.onrender.com/other.jpg"],
  images_json: '["/img.jpg","https://vinfreak.onrender.com/other.jpg","   "]',
});
assert.deepStrictEqual(withImages.__images, [
  "https://vinfreak.onrender.com/img.jpg",
  "https://vinfreak.onrender.com/other.jpg",
]);
assert.strictEqual(withImages.__image, "https://vinfreak.onrender.com/img.jpg");

const smallFacebookImage =
  "https://scontent-sea5-1.xx.fbcdn.net/v/t39.30808-6/641169191_3491986280954086_2772721028042121608_n.jpg?stp=c256.0.1537.1537a_dst-jpg_s261x260_tt6&_nc_cat=102";
const largeFacebookImage =
  "https://scontent.ftun16-1.fna.fbcdn.net/v/t39.30808-6/641169191_3491986280954086_2772721028042121608_n.jpg?stp=dst-jpg_s960x960_tt6&_nc_cat=102";

const facebookOnlySmall = normalizeCar({ source: "facebook_marketplace", image_url: smallFacebookImage });
assert.strictEqual(facebookOnlySmall.__image, smallFacebookImage);

const facebookMixedSizes = normalizeCar({
  source: "facebook_marketplace",
  images: [smallFacebookImage, largeFacebookImage],
});
assert.ok(typeof facebookMixedSizes.__image === "string");
assert.ok(facebookMixedSizes.__image.includes("scontent.ftun16-1.fna.fbcdn.net"));
assert.ok(facebookMixedSizes.__image.includes("s960x960"));

const facebookT39ListingPhoto =
  "https://scontent.ftun16-1.fna.fbcdn.net/v/t39.30808-6/582428064_821209330527584_6887293416924184705_n.jpg?stp=dst-jpg_s960x960_tt6";
const facebookT15PreviewAsset =
  "https://scontent.fsdv2-1.fna.fbcdn.net/v/t15.5256-10/636737382_1239900624988524_3882091659158392926_n.jpg?stp=dst-jpg_s960x960_tt6";
const facebookT15VsT39 = normalizeCar({
  source: "facebook_marketplace",
  images: [facebookT15PreviewAsset, facebookT39ListingPhoto],
});
assert.strictEqual(facebookT15VsT39.__image, facebookT39ListingPhoto);

const facebookT45CreativeAsset =
  "https://scontent.ftun16-1.fna.fbcdn.net/v/t45.5328-4/613630968_833615156175292_937585223098408405_n.jpg?_nc_cat=100&_nc_sid=247b10";
const facebookT39MainPhoto =
  "https://scontent.ftun16-1.fna.fbcdn.net/v/t39.84726-6/615464151_1599772141015719_367869530425736683_n.jpg?_nc_cat=101&_nc_sid=92e707";
const facebookT45VsT39Main = normalizeCar({
  source: "facebook_marketplace",
  images: [facebookT45CreativeAsset, facebookT39MainPhoto],
});
assert.strictEqual(facebookT45VsT39Main.__image, facebookT39MainPhoto);

const facebookNoStpFirst =
  "https://scontent.ftun16-1.fna.fbcdn.net/v/t39.30808-6/641599142_122115908877172684_6217874038216130411_n.jpg?_nc_cat=101&_nc_sid=4f26a2";
const facebookStpLater =
  "https://scontent.ftun16-1.fna.fbcdn.net/v/t39.30808-6/641599142_122115908877172684_6217874038216130411_n.jpg?stp=dst-jpg_s960x960_tt6&_nc_cat=101";
const facebookNoStpVsStp = normalizeCar({
  source: "facebook_marketplace",
  images: [facebookNoStpFirst, facebookStpLater],
});
assert.strictEqual(facebookNoStpVsStp.__image, facebookNoStpFirst);

const facebookMainNoStpT39 =
  "https://scontent.ftun16-1.fna.fbcdn.net/v/t39.84726-6/605287716_1403537708068884_936304200574013609_n.jpg?_nc_cat=103&_nc_sid=92e707";
const facebookProfileAvatar =
  "https://scontent.ftlv23-1.fna.fbcdn.net/v/t39.30808-1/376263590_984184439473533_1821345216609647036_n.jpg?stp=cp0_dst-jpg_s40x40_tt6&_nc_cat=110";
const facebookMainVsAvatar = normalizeCar({
  source: "facebook_marketplace",
  images: [facebookProfileAvatar, facebookMainNoStpT39],
});
assert.strictEqual(facebookMainVsAvatar.__image, facebookMainNoStpT39);

const facebookAvatarOnly = normalizeCar({
  source: "facebook_marketplace",
  image_url: facebookProfileAvatar,
});
assert.strictEqual(facebookAvatarOnly.__image, null);

const facebookLargeT39NonAvatar =
  "https://scontent.ftun16-1.fna.fbcdn.net/v/t39.30808-1/582428064_821209330527584_6887293416924184705_n.jpg?stp=dst-jpg_s960x960_tt6";
const facebookLargeT39Result = normalizeCar({
  source: "facebook_marketplace",
  image_url: facebookLargeT39NonAvatar,
});
assert.strictEqual(facebookLargeT39Result.__image, facebookLargeT39NonAvatar);

const facebookStaticHostAsset =
  "https://static.xx.fbcdn.net/v/t39.30808-6/629398644_122164206392904381_7514226290104153954_n.jpg?stp=dst-jpg_s960x960_tt6";
const facebookStaticHostOnly = normalizeCar({
  source: "facebook_marketplace",
  image_url: facebookStaticHostAsset,
});
assert.strictEqual(facebookStaticHostOnly.__image, null);

const facebookStaticHostVsScontent = normalizeCar({
  source: "facebook_marketplace",
  images: [facebookStaticHostAsset, facebookLargeT39NonAvatar],
});
assert.strictEqual(facebookStaticHostVsScontent.__image, facebookLargeT39NonAvatar);

const facebookUrlWithReferral = normalizeCar({
  source: "facebook_marketplace",
  url:
    "https://www.facebook.com/marketplace/item/2616863118695946/" +
    "?ref=browse_tab&referral_code=marketplace_top_picks&referral_story_type=top_picks",
});
assert.strictEqual(
  facebookUrlWithReferral.url,
  "https://www.facebook.com/marketplace/item/2616863118695946/",
);

const manualTransmission = normalizeCar({ transmission: "6-Speed Manual" });
assert.strictEqual(manualTransmission.__transmission, "Manual");
assert.strictEqual(manualTransmission.transmission, "6-Speed Manual");

const automaticTransmission = normalizeCar({ transmission: "8-Speed Automatic" });
assert.strictEqual(automaticTransmission.__transmission, "Automatic");
assert.strictEqual(automaticTransmission.transmission, "8-Speed Automatic");

const codedManual = normalizeCar({ transmission: "6MT" });
assert.strictEqual(codedManual.__transmission, "Manual");

const codedAutomatic = normalizeCar({ transmission: "A/T" });
assert.strictEqual(codedAutomatic.__transmission, "Automatic");

const timestamps = normalizeCar({
  posted_at: " 2024-03-02T01:00:00Z ",
  created_at: "None",
  updated_at: 1709337600,
});
assert.strictEqual(timestamps.posted_at, "2024-03-02T01:00:00Z");
assert.strictEqual(timestamps.created_at, null);
assert.strictEqual(timestamps.updated_at, 1709337600);

const createdStamp = normalizeCar({ created_at: " 2024-05-15T12:34:56Z " });
assert.strictEqual(createdStamp.created_at, "2024-05-15T12:34:56Z");

console.log("normalizeCar tests passed");

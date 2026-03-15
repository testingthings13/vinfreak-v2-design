export function getCarImage(car) {
  if (!car || typeof car !== 'object') return null;
  // Common fields
  const direct = car.image || car.image_url || car.thumbnail || car.thumb || car.photo || car.picture;
  if (direct && typeof direct === 'string') return direct;

  // Arrays
  if (Array.isArray(car.images) && car.images[0]) return car.images[0];
  if (Array.isArray(car.photos) && car.photos[0]) return car.photos[0];

  // Nested
  if (car.media?.cover) return car.media.cover;
  if (car.media?.images?.length) return car.media.images[0];

  return null;
}

// services/geoService.js
//
// Geospatial queries using PostGIS via raw SQL.
//
// Why raw SQL instead of Prisma queries?
//   Prisma's query builder does not support PostGIS functions like ST_DWithin or ST_MakePoint.
//   For geospatial work, we use prisma.$queryRaw which sends SQL directly to PostgreSQL.
//
// Key PostGIS functions used:
//   ST_MakePoint(longitude, latitude) — creates a geometry point from coordinates
//   ::geography                        — casts geometry to "geography" type
//                                        (geography uses meters on a sphere;
//                                         geometry uses degrees on a flat plane)
//   ST_DWithin(a, b, meters)           — returns true if two points are within X meters
//   ST_Distance(a, b)                  — returns distance in meters between two points
//
// Note: PostGIS takes (longitude, latitude) order — NOT (lat, lng). Common gotcha!

const prisma = require('../config/prisma');

// Find verified, available donors of a specific blood group within a radius
async function findNearbyDonors({ lat, lng, bloodGroup, radiusKm }) {
  const radiusMeters = radiusKm * 1000;

  // Prisma.$queryRaw uses tagged template literals.
  // Values passed as ${variable} are automatically parameterized (no SQL injection risk).
  // Note: Prisma keeps camelCase column names in PostgreSQL (not snake_case).
  // So the actual columns are "fcmToken", "isAvailable", "verifiedStatus", "bloodGroup".
  const donors = await prisma.$queryRaw`
    SELECT
      id,
      name,
      "fcmToken",
      latitude,
      longitude,
      district,
      "bloodGroup",
      ST_Distance(
        ST_MakePoint(longitude, latitude)::geography,
        ST_MakePoint(${lng}, ${lat})::geography
      ) AS distance_meters
    FROM "User"
    WHERE "isAvailable"    = true
      AND "verifiedStatus" = 'VERIFIED'::"VerifiedStatus"
      AND "bloodGroup"     = ${bloodGroup}::"BloodGroup"
      AND latitude         IS NOT NULL
      AND longitude        IS NOT NULL
      AND ST_DWithin(
            ST_MakePoint(longitude, latitude)::geography,
            ST_MakePoint(${lng}, ${lat})::geography,
            ${radiusMeters}
          )
    ORDER BY distance_meters ASC
    LIMIT 20
  `;

  return donors;
}

module.exports = { findNearbyDonors };

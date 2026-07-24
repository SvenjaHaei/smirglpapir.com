# Editing Products (Like Events)

Products are controlled from `assets/data/products.json`.

## Quick fields

- `name`: product title shown on the card.
- `description`: product description shown on the card.
- `price`: number in CZK (e.g. `349`).
- `stock`: maximum available quantity customers can add.
- `variants`: options for the variant dropdown.

## Easier image management

Use these two fields together:

- `galleryPath`: common folder path for this product's images.
- `images`: only file names (for example `"1.jpg"`, `"2.jpg"`).

Example:

```json
{
  "sku": "SP-EXAMPLE-001",
  "name": "Example Vase",
  "description": "A short product description.",
  "price": 399,
  "galleryPath": "/images/gallery/poppys/vases/",
  "images": ["1.jpg", "2.jpg", "3.jpg"],
  "variants": [
    { "id": "rose", "label": "Rose" },
    { "id": "teal", "label": "Teal" }
  ]
}
```

## Notes

- First image in `images` is used as the primary product image.
- If a product has only one image, keep a single file in `images`.
- You can still use full image paths in `images` if needed.
- `sku` should stay unique.

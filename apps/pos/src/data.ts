export const categories = [
  "All",
  "Atiéké",
  "Rice",
  "Yam",
  "Proteins",
  "Drinks",
  "Extras",
];

export const menuItems = [
  {
    id: "jollof",
    name: "Assorted Jollof Rice",
    description: "Rice with assorted protein",
    price: 59.99,
    category: "Rice",
    color: "bg-orange-100",
  },
  {
    id: "chicken",
    name: "Fried Chicken",
    description: "Seasoned fried chicken cut",
    price: 25,
    category: "Proteins",
    color: "bg-amber-100",
  },
  {
    id: "atieke",
    name: "Plain Atiéké",
    description: "Steamed plain atiéké",
    price: 25,
    category: "Atiéké",
    color: "bg-stone-200",
  },
  {
    id: "tilapia",
    name: "Grilled Tilapia",
    description: "Whole grilled tilapia",
    price: 99.99,
    category: "Proteins",
    color: "bg-sky-100",
  },
  {
    id: "coke",
    name: "Tropical Sunset",
    description: "Signature tropical mocktail",
    price: 60,
    category: "Drinks",
    color: "bg-rose-100",
  },
  {
    id: "yam",
    name: "Fried Yam",
    description: "Crispy fried yam slices",
    price: 39.99,
    category: "Yam",
    color: "bg-fuchsia-100",
  },
  {
    id: "plantain",
    name: "Plantain",
    description: "Fried ripe plantain side",
    price: 3,
    category: "Yam",
    color: "bg-yellow-100",
  },
  {
    id: "beignet",
    name: "Beignet",
    description: "Sweet beignet serving",
    price: 60,
    category: "Extras",
    color: "bg-red-100",
  },
];

export type NavigationItem =
  "POS" | "Orders" | "Tables" | "Menu" | "Inventory" | "Settings";
export const navigationItems: NavigationItem[] = [
  "POS",
  "Orders",
  "Tables",
  "Menu",
  "Inventory",
  "Settings",
];

/**
 * Plaid Personal Finance Categories (PFC) Taxonomy
 * Based on Plaid's official categorization system
 * Source: https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv
 */

export interface PlaidSubcategory {
  name: string;
  description: string;
}

export interface PlaidPrimaryCategory {
  name: string;
  subcategories: Record<string, PlaidSubcategory>;
}

export const PLAID_CATEGORIES: Record<string, PlaidPrimaryCategory> = {
  INCOME: {
    name: "Income",
    subcategories: {
      INCOME_DIVIDENDS: {
        name: "Dividends",
        description: "Dividends from investment accounts"
      },
      INCOME_INTEREST_EARNED: {
        name: "Interest Earned",
        description: "Income from interest on savings accounts"
      },
      INCOME_RETIREMENT_PENSION: {
        name: "Retirement Pension",
        description: "Income from pension payments"
      },
      INCOME_TAX_REFUND: {
        name: "Tax Refund",
        description: "Income from tax refunds"
      },
      INCOME_UNEMPLOYMENT: {
        name: "Unemployment",
        description: "Income from unemployment benefits, including unemployment insurance and healthcare"
      },
      INCOME_WAGES: {
        name: "Wages",
        description: "Income from salaries, gig-economy work, and tips earned"
      },
      INCOME_OTHER_INCOME: {
        name: "Other Income",
        description: "Other miscellaneous income, including alimony, social security, child support, and rental"
      }
    }
  },
  
  TRANSFER_IN: {
    name: "Transfer In",
    subcategories: {
      TRANSFER_IN_CASH_ADVANCES_AND_LOANS: {
        name: "Cash Advances and Loans",
        description: "Loans and cash advances deposited into a bank account"
      },
      TRANSFER_IN_DEPOSIT: {
        name: "Deposit",
        description: "Cash, checks, and ATM deposits into a bank account"
      },
      TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS: {
        name: "Investment and Retirement Funds",
        description: "Inbound transfers to an investment or retirement account"
      },
      TRANSFER_IN_SAVINGS: {
        name: "Savings",
        description: "Inbound transfers to a savings account"
      },
      TRANSFER_IN_ACCOUNT_TRANSFER: {
        name: "Account Transfer",
        description: "General inbound transfers from another account"
      },
      TRANSFER_IN_OTHER_TRANSFER_IN: {
        name: "Other Transfer In",
        description: "Other miscellaneous inbound transactions"
      }
    }
  },
  
  TRANSFER_OUT: {
    name: "Transfer Out",
    subcategories: {
      TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS: {
        name: "Investment and Retirement Funds",
        description: "Transfers to an investment or retirement account, including investment apps such as Acorns, Betterment"
      },
      TRANSFER_OUT_SAVINGS: {
        name: "Savings",
        description: "Outbound transfers to savings accounts"
      },
      TRANSFER_OUT_WITHDRAWAL: {
        name: "Withdrawal",
        description: "Withdrawals from a bank account"
      },
      TRANSFER_OUT_ACCOUNT_TRANSFER: {
        name: "Account Transfer",
        description: "General outbound transfers to another account"
      },
      TRANSFER_OUT_OTHER_TRANSFER_OUT: {
        name: "Other Transfer Out",
        description: "Other miscellaneous outbound transactions"
      }
    }
  },
  
  LOAN_PAYMENTS: {
    name: "Loan Payments",
    subcategories: {
      LOAN_PAYMENTS_CAR_PAYMENT: {
        name: "Car Payment",
        description: "Car loans and leases"
      },
      LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: {
        name: "Credit Card Payment",
        description: "Payments to a credit card. These are positive amounts for credit card subtypes and negative for depository subtypes"
      },
      LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: {
        name: "Personal Loan Payment",
        description: "Personal loans, including cash advances and buy now pay later repayments"
      },
      LOAN_PAYMENTS_MORTGAGE_PAYMENT: {
        name: "Mortgage Payment",
        description: "Payments on mortgages"
      },
      LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: {
        name: "Student Loan Payment",
        description: "Payments on student loans. For college tuition, refer to \"General Services - Education\""
      },
      LOAN_PAYMENTS_OTHER_PAYMENT: {
        name: "Other Payment",
        description: "Other miscellaneous debt payments"
      }
    }
  },
  
  BANK_FEES: {
    name: "Bank Fees",
    subcategories: {
      BANK_FEES_ATM_FEES: {
        name: "ATM Fees",
        description: "Fees incurred for out-of-network ATMs"
      },
      BANK_FEES_FOREIGN_TRANSACTION_FEES: {
        name: "Foreign Transaction Fees",
        description: "Fees incurred on non-domestic transactions"
      },
      BANK_FEES_INSUFFICIENT_FUNDS: {
        name: "Insufficient Funds",
        description: "Fees relating to insufficient funds"
      },
      BANK_FEES_INTEREST_CHARGE: {
        name: "Interest Charge",
        description: "Fees incurred for interest on purchases, including not-paid-in-full or interest on cash advances"
      },
      BANK_FEES_OVERDRAFT_FEES: {
        name: "Overdraft Fees",
        description: "Fees incurred when an account is in overdraft"
      },
      BANK_FEES_OTHER_BANK_FEES: {
        name: "Other Bank Fees",
        description: "Other miscellaneous bank fees"
      }
    }
  },
  
  ENTERTAINMENT: {
    name: "Entertainment",
    subcategories: {
      ENTERTAINMENT_CASINOS_AND_GAMBLING: {
        name: "Casinos and Gambling",
        description: "Gambling, casinos, and sports betting"
      },
      ENTERTAINMENT_MUSIC_AND_AUDIO: {
        name: "Music and Audio",
        description: "Digital and in-person music purchases, including music streaming services"
      },
      ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: {
        name: "Sporting Events, Amusement Parks and Museums",
        description: "Purchases made at sporting events, music venues, concerts, museums, and amusement parks"
      },
      ENTERTAINMENT_TV_AND_MOVIES: {
        name: "TV and Movies",
        description: "In home movie streaming services and movie theaters"
      },
      ENTERTAINMENT_VIDEO_GAMES: {
        name: "Video Games",
        description: "Digital and in-person video game purchases"
      },
      ENTERTAINMENT_OTHER_ENTERTAINMENT: {
        name: "Other Entertainment",
        description: "Other miscellaneous entertainment purchases, including night life and adult entertainment"
      }
    }
  },
  
  FOOD_AND_DRINK: {
    name: "Food and Drink",
    subcategories: {
      FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: {
        name: "Beer, Wine and Liquor",
        description: "Beer, Wine & Liquor Stores"
      },
      FOOD_AND_DRINK_COFFEE: {
        name: "Coffee",
        description: "Purchases at coffee shops or cafes"
      },
      FOOD_AND_DRINK_FAST_FOOD: {
        name: "Fast Food",
        description: "Dining expenses for fast food chains"
      },
      FOOD_AND_DRINK_GROCERIES: {
        name: "Groceries",
        description: "Purchases for fresh produce and groceries, including farmers' markets"
      },
      FOOD_AND_DRINK_RESTAURANT: {
        name: "Restaurant",
        description: "Dining expenses for restaurants, bars, gastropubs, and diners"
      },
      FOOD_AND_DRINK_VENDING_MACHINES: {
        name: "Vending Machines",
        description: "Purchases made at vending machine operators"
      },
      FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK: {
        name: "Other Food and Drink",
        description: "Other miscellaneous food and drink, including desserts, juice bars, and delis"
      }
    }
  },
  
  GENERAL_MERCHANDISE: {
    name: "General Merchandise",
    subcategories: {
      GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: {
        name: "Bookstores and Newsstands",
        description: "Books, magazines, and news"
      },
      GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: {
        name: "Clothing and Accessories",
        description: "Apparel, shoes, and jewelry"
      },
      GENERAL_MERCHANDISE_CONVENIENCE_STORES: {
        name: "Convenience Stores",
        description: "Purchases at convenience stores"
      },
      GENERAL_MERCHANDISE_DEPARTMENT_STORES: {
        name: "Department Stores",
        description: "Retail stores with wide ranges of consumer goods, typically specializing in clothing and home goods"
      },
      GENERAL_MERCHANDISE_DISCOUNT_STORES: {
        name: "Discount Stores",
        description: "Stores selling goods at a discounted price"
      },
      GENERAL_MERCHANDISE_ELECTRONICS: {
        name: "Electronics",
        description: "Electronics stores and websites"
      },
      GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: {
        name: "Gifts and Novelties",
        description: "Photo, gifts, cards, and floral stores"
      },
      GENERAL_MERCHANDISE_OFFICE_SUPPLIES: {
        name: "Office Supplies",
        description: "Stores that specialize in office goods"
      },
      GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: {
        name: "Online Marketplaces",
        description: "Multi-purpose e-commerce platforms such as Etsy, Ebay and Amazon"
      },
      GENERAL_MERCHANDISE_PET_SUPPLIES: {
        name: "Pet Supplies",
        description: "Pet supplies and pet food"
      },
      GENERAL_MERCHANDISE_SPORTING_GOODS: {
        name: "Sporting Goods",
        description: "Sporting goods, camping gear, and outdoor equipment"
      },
      GENERAL_MERCHANDISE_SUPERSTORES: {
        name: "Superstores",
        description: "Superstores such as Target and Walmart, selling both groceries and general merchandise"
      },
      GENERAL_MERCHANDISE_TOBACCO_AND_VAPE: {
        name: "Tobacco and Vape",
        description: "Purchases for tobacco and vaping products"
      },
      GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE: {
        name: "Other General Merchandise",
        description: "Other miscellaneous merchandise, including toys, hobbies, and arts and crafts"
      }
    }
  },
  
  HOME_IMPROVEMENT: {
    name: "Home Improvement",
    subcategories: {
      HOME_IMPROVEMENT_FURNITURE: {
        name: "Furniture",
        description: "Furniture, bedding, and home accessories"
      },
      HOME_IMPROVEMENT_HARDWARE: {
        name: "Hardware",
        description: "Building materials, hardware stores, paint, and wallpaper"
      },
      HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: {
        name: "Repair and Maintenance",
        description: "Plumbing, lighting, gardening, and roofing"
      },
      HOME_IMPROVEMENT_SECURITY: {
        name: "Security",
        description: "Home security system purchases"
      },
      HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT: {
        name: "Other Home Improvement",
        description: "Other miscellaneous home purchases, including pool installation and pest control"
      }
    }
  },
  
  MEDICAL: {
    name: "Medical",
    subcategories: {
      MEDICAL_DENTAL_CARE: {
        name: "Dental Care",
        description: "Dentists and general dental care"
      },
      MEDICAL_EYE_CARE: {
        name: "Eye Care",
        description: "Optometrists, contacts, and glasses stores"
      },
      MEDICAL_NURSING_CARE: {
        name: "Nursing Care",
        description: "Nursing care and facilities"
      },
      MEDICAL_PHARMACIES_AND_SUPPLEMENTS: {
        name: "Pharmacies and Supplements",
        description: "Pharmacies and nutrition shops"
      },
      MEDICAL_PRIMARY_CARE: {
        name: "Primary Care",
        description: "Doctors and physicians"
      },
      MEDICAL_VETERINARY_SERVICES: {
        name: "Veterinary Services",
        description: "Prevention and care procedures for animals"
      },
      MEDICAL_OTHER_MEDICAL: {
        name: "Other Medical",
        description: "Other miscellaneous medical, including blood work, hospitals, and ambulances"
      }
    }
  },
  
  PERSONAL_CARE: {
    name: "Personal Care",
    subcategories: {
      PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: {
        name: "Gyms and Fitness Centers",
        description: "Gyms, fitness centers, and workout classes"
      },
      PERSONAL_CARE_HAIR_AND_BEAUTY: {
        name: "Hair and Beauty",
        description: "Manicures, haircuts, waxing, spa/massages, and bath and beauty products"
      },
      PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING: {
        name: "Laundry and Dry Cleaning",
        description: "Wash and fold, and dry cleaning expenses"
      },
      PERSONAL_CARE_OTHER_PERSONAL_CARE: {
        name: "Other Personal Care",
        description: "Other miscellaneous personal care, including mental health apps and services"
      }
    }
  },
  
  GENERAL_SERVICES: {
    name: "General Services",
    subcategories: {
      GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: {
        name: "Accounting and Financial Planning",
        description: "Financial planning, and tax and accounting services"
      },
      GENERAL_SERVICES_AUTOMOTIVE: {
        name: "Automotive",
        description: "Oil changes, car washes, repairs, and towing"
      },
      GENERAL_SERVICES_CHILDCARE: {
        name: "Childcare",
        description: "Babysitters and daycare"
      },
      GENERAL_SERVICES_CONSULTING_AND_LEGAL: {
        name: "Consulting and Legal",
        description: "Consulting and legal services"
      },
      GENERAL_SERVICES_EDUCATION: {
        name: "Education",
        description: "Elementary, high school, professional schools, and college tuition"
      },
      GENERAL_SERVICES_INSURANCE: {
        name: "Insurance",
        description: "Insurance for auto, home, and healthcare"
      },
      GENERAL_SERVICES_POSTAGE_AND_SHIPPING: {
        name: "Postage and Shipping",
        description: "Mail, packaging, and shipping services"
      },
      GENERAL_SERVICES_STORAGE: {
        name: "Storage",
        description: "Storage services and facilities"
      },
      GENERAL_SERVICES_OTHER_GENERAL_SERVICES: {
        name: "Other General Services",
        description: "Other miscellaneous services, including advertising and cloud storage"
      }
    }
  },
  
  GOVERNMENT_AND_NON_PROFIT: {
    name: "Government and Non-Profit",
    subcategories: {
      GOVERNMENT_AND_NON_PROFIT_DONATIONS: {
        name: "Donations",
        description: "Charitable, political, and religious donations"
      },
      GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES: {
        name: "Government Departments and Agencies",
        description: "Government departments and agencies, such as driving licences, and passport renewal"
      },
      GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: {
        name: "Tax Payment",
        description: "Tax payments, including income and property taxes"
      },
      GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT: {
        name: "Other Government and Non-Profit",
        description: "Other miscellaneous government and non-profit agencies"
      }
    }
  },
  
  TRANSPORTATION: {
    name: "Transportation",
    subcategories: {
      TRANSPORTATION_BIKES_AND_SCOOTERS: {
        name: "Bikes and Scooters",
        description: "Bike and scooter rentals"
      },
      TRANSPORTATION_GAS: {
        name: "Gas",
        description: "Purchases at a gas station"
      },
      TRANSPORTATION_PARKING: {
        name: "Parking",
        description: "Parking fees and expenses"
      },
      TRANSPORTATION_PUBLIC_TRANSIT: {
        name: "Public Transit",
        description: "Public transportation, including rail and train, buses, and metro"
      },
      TRANSPORTATION_TAXIS_AND_RIDE_SHARES: {
        name: "Taxis and Ride Shares",
        description: "Taxi and ride share services"
      },
      TRANSPORTATION_TOLLS: {
        name: "Tolls",
        description: "Toll expenses"
      },
      TRANSPORTATION_OTHER_TRANSPORTATION: {
        name: "Other Transportation",
        description: "Other miscellaneous transportation expenses"
      }
    }
  },
  
  TRAVEL: {
    name: "Travel",
    subcategories: {
      TRAVEL_FLIGHTS: {
        name: "Flights",
        description: "Airline expenses"
      },
      TRAVEL_LODGING: {
        name: "Lodging",
        description: "Hotels, motels, and hosted accommodation such as Airbnb"
      },
      TRAVEL_RENTAL_CARS: {
        name: "Rental Cars",
        description: "Rental cars, charter buses, and trucks"
      },
      TRAVEL_OTHER_TRAVEL: {
        name: "Other Travel",
        description: "Other miscellaneous travel expenses"
      }
    }
  },
  
  RENT_AND_UTILITIES: {
    name: "Rent and Utilities",
    subcategories: {
      RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: {
        name: "Gas and Electricity",
        description: "Gas and electricity bills"
      },
      RENT_AND_UTILITIES_INTERNET_AND_CABLE: {
        name: "Internet and Cable",
        description: "Internet and cable bills"
      },
      RENT_AND_UTILITIES_RENT: {
        name: "Rent",
        description: "Rent payment"
      },
      RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: {
        name: "Sewage and Waste Management",
        description: "Sewage and garbage disposal bills"
      },
      RENT_AND_UTILITIES_TELEPHONE: {
        name: "Telephone",
        description: "Cell phone bills"
      },
      RENT_AND_UTILITIES_WATER: {
        name: "Water",
        description: "Water bills"
      },
      RENT_AND_UTILITIES_OTHER_UTILITIES: {
        name: "Other Utilities",
        description: "Other miscellaneous utility bills"
      }
    }
  }
};

/**
 * Helper function to get all category IDs for validation
 */
export function getAllPlaidCategoryIds(): string[] {
  const ids: string[] = [];
  
  Object.entries(PLAID_CATEGORIES).forEach(([primaryId, primary]) => {
    ids.push(primaryId);
    Object.keys(primary.subcategories).forEach(subcategoryId => {
      ids.push(subcategoryId);
    });
  });
  
  return ids;
}

/**
 * Helper function to check if a category ID is a Plaid category
 */
export function isPlaidCategory(categoryId: string): boolean {
  // Check if it's a primary category
  if (PLAID_CATEGORIES[categoryId]) {
    return true;
  }
  
  // Check if it's a subcategory
  for (const primary of Object.values(PLAID_CATEGORIES)) {
    if (primary.subcategories[categoryId]) {
      return true;
    }
  }
  
  return false;
}

/**
 * Helper function to get category details
 */
export function getPlaidCategoryDetails(categoryId: string): { name: string; description?: string; parentId?: string } | null {
  // Check if it's a primary category
  if (PLAID_CATEGORIES[categoryId]) {
    return {
      name: PLAID_CATEGORIES[categoryId].name,
      description: undefined,
      parentId: undefined
    };
  }
  
  // Check subcategories
  for (const [primaryId, primary] of Object.entries(PLAID_CATEGORIES)) {
    if (primary.subcategories[categoryId]) {
      return {
        name: primary.subcategories[categoryId].name,
        description: primary.subcategories[categoryId].description,
        parentId: primaryId
      };
    }
  }
  
  return null;
}
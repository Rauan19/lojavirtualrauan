-- O pagamento é sempre o Brick na loja; lojas que estavam no Checkout Pro
-- passam para o Brick (o lojista não escolhe mais o modelo).
UPDATE "Store" SET "checkoutMode" = 'personalized' WHERE "checkoutMode" <> 'personalized';

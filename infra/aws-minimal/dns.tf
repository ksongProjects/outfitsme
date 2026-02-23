resource "aws_route53_record" "app_direct" {
  count = !var.enable_edge_protection && var.domain_name != "" && var.route53_zone_id != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = 60
  records = [aws_eip.app.public_ip]
}
